import type { BeanDefinition, Dependency } from './bean-definition.js';
import type { BeanPostProcessor } from './bean-post-processor.js';
import {
  AsyncBeanNotReadyError,
  ContextClosedError,
  MissingDependencyError,
} from './errors.js';
import type { InjectionToken } from './injection-token.js';
import { topoSort } from './topo-sort.js';
import type { Constructor } from './types.js';

type Token = InjectionToken<unknown> | Constructor;

const UNRESOLVED = Symbol('UNRESOLVED');

/**
 * The runtime dependency injection container.
 *
 * Created from an array of BeanDefinitions (produced by the compile-time
 * transformer or built manually). Manages scoping, lazy/eager instantiation,
 * async deduplication, and BeanPostProcessor hooks.
 */
export class ApplicationContext {
  private readonly defsByToken = new Map<Token, BeanDefinition[]>();
  private readonly primaryDef = new Map<Token, BeanDefinition>();
  private readonly singletonCache = new Map<Token, unknown>();
  private readonly asyncInFlight = new Map<Token, Promise<unknown>>();
  private readonly postProcessors: BeanPostProcessor[] = [];
  private closed = false;

  private constructor(private readonly sortedDefs: BeanDefinition[]) {
    for (const def of sortedDefs) {
      const existing = this.defsByToken.get(def.token);
      if (existing) {
        existing.push(def);
      } else {
        this.defsByToken.set(def.token, [def]);
      }
      // Last definition wins as primary (matches typical DI override semantics)
      this.primaryDef.set(def.token, def);
    }
  }

  /**
   * Build and initialize an ApplicationContext.
   *
   * 1. Topologically sorts definitions
   * 2. Validates required dependencies exist
   * 3. Discovers and initializes BeanPostProcessors
   * 4. Eagerly resolves beans marked with `eager: true`
   */
  static async create(
    definitions: BeanDefinition[],
  ): Promise<ApplicationContext> {
    const sorted = topoSort(definitions);
    const ctx = new ApplicationContext(sorted);
    ctx.validateDependencies();
    await ctx.initPostProcessors();
    await ctx.initEagerBeans();
    return ctx;
  }

  /**
   * Synchronously get a bean. Throws if:
   * - The bean is async and hasn't been resolved yet
   * - The token has no provider
   * - The context is closed
   */
  get<T>(token: Constructor<T> | InjectionToken<T>): T {
    this.assertOpen();
    const def = this.primaryDef.get(token as Token);
    if (!def) {
      throw new MissingDependencyError(tokenName(token as Token));
    }

    if (def.scope === 'singleton') {
      const cached = this.singletonCache.get(token as Token);
      if (cached === UNRESOLVED || this.asyncInFlight.has(token as Token)) {
        throw new AsyncBeanNotReadyError(tokenName(token as Token));
      }
      if (cached !== undefined) {
        return cached as T;
      }
      // Attempt synchronous resolution
      const instance = this.resolveSync<T>(def);
      return instance;
    }

    // Prototype: new instance every time
    return this.resolveSync<T>(def);
  }

  /**
   * Asynchronously get a bean. Always works, even for async factories.
   */
  async getAsync<T>(token: Constructor<T> | InjectionToken<T>): Promise<T> {
    this.assertOpen();
    const def = this.primaryDef.get(token as Token);
    if (!def) {
      throw new MissingDependencyError(tokenName(token as Token));
    }

    if (def.scope === 'singleton') {
      const cached = this.singletonCache.get(token as Token);
      if (cached !== undefined && cached !== UNRESOLVED) {
        return cached as T;
      }

      // Deduplicate concurrent async resolution
      const inFlight = this.asyncInFlight.get(token as Token);
      if (inFlight) {
        return inFlight as Promise<T>;
      }

      const promise = this.resolveAsync<T>(def);
      this.asyncInFlight.set(token as Token, promise);
      try {
        const instance = await promise;
        return instance;
      } finally {
        this.asyncInFlight.delete(token as Token);
      }
    }

    // Prototype
    return this.resolveAsync<T>(def);
  }

  /**
   * Get all beans registered under the given token.
   * Throws if any bean has an async factory — use `getAllAsync()` instead.
   */
  getAll<T>(token: Constructor<T> | InjectionToken<T>): T[] {
    this.assertOpen();
    const defs = this.defsByToken.get(token as Token);
    if (!defs || defs.length === 0) {
      return [];
    }
    return defs.map((def) => {
      if (def.scope === 'singleton') {
        const cached = this.singletonCache.get(def.token);
        if (cached !== undefined && cached !== UNRESOLVED) {
          return cached as T;
        }
      }
      return this.resolveSync<T>(def);
    });
  }

  /**
   * Asynchronously get all beans registered under the given token.
   * Safe to use when beans may have async factories.
   */
  async getAllAsync<T>(
    token: Constructor<T> | InjectionToken<T>,
  ): Promise<T[]> {
    this.assertOpen();
    const defs = this.defsByToken.get(token as Token);
    if (!defs || defs.length === 0) {
      return [];
    }
    const results: T[] = [];
    for (const def of defs) {
      if (def.scope === 'singleton') {
        const cached = this.singletonCache.get(def.token);
        if (cached !== undefined && cached !== UNRESOLVED) {
          results.push(cached as T);
          continue;
        }
      }
      results.push((await this.resolveAsyncRaw(def, false)) as T);
    }
    return results;
  }

  /**
   * Returns a shallow defensive copy of the bean definitions used to build this context.
   */
  getDefinitions(): readonly BeanDefinition[] {
    return [...this.sortedDefs];
  }

  /**
   * Close the context. Calls `@PreDestroy` methods on instantiated singletons
   * in reverse-topological order (dependents destroyed before dependencies),
   * then clears caches and rejects further calls.
   */
  async close(): Promise<void> {
    this.closed = true;

    const errors: Error[] = [];
    for (const def of [...this.sortedDefs].reverse()) {
      if (def.scope !== 'singleton') continue;
      const methods = def.metadata.preDestroyMethods as string[] | undefined;
      if (!methods || methods.length === 0) continue;

      const instance = this.singletonCache.get(def.token);
      if (instance === undefined || instance === UNRESOLVED) continue;

      for (const methodName of methods) {
        try {
          await (instance as Record<string, () => unknown>)[methodName]();
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    this.singletonCache.clear();
    this.asyncInFlight.clear();

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(errors, 'Errors during bean destruction');
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ContextClosedError();
    }
  }

  private validateDependencies(): void {
    for (const def of this.sortedDefs) {
      for (const dep of def.dependencies) {
        if (
          !dep.optional &&
          !dep.collection &&
          !this.primaryDef.has(dep.token)
        ) {
          throw new MissingDependencyError(
            tokenName(dep.token),
            tokenName(def.token),
          );
        }
      }
    }
  }

  private async initPostProcessors(): Promise<void> {
    for (const def of this.sortedDefs) {
      if (def.metadata.isBeanPostProcessor) {
        const processor = await this.resolveAsyncRaw(def, true);
        this.postProcessors.push(processor as BeanPostProcessor);
      }
    }
  }

  private async initEagerBeans(): Promise<void> {
    for (const def of this.sortedDefs) {
      if (def.eager && !def.metadata.isBeanPostProcessor) {
        await this.resolveAsyncRaw(def, false);
      }
    }
  }

  private resolveDepsSync(deps: Dependency[]): unknown[] {
    return deps.map((dep) => {
      if (dep.collection) {
        return this.getAll(dep.token);
      }
      const depDef = this.primaryDef.get(dep.token);
      if (!depDef) {
        if (dep.optional) return undefined;
        throw new MissingDependencyError(tokenName(dep.token));
      }
      if (depDef.scope === 'singleton') {
        const cached = this.singletonCache.get(dep.token);
        if (cached !== undefined && cached !== UNRESOLVED) return cached;
      }
      return this.resolveSync(depDef);
    });
  }

  private async resolveDepsAsync(deps: Dependency[]): Promise<unknown[]> {
    const resolved: unknown[] = [];
    for (const dep of deps) {
      if (dep.collection) {
        resolved.push(await this.getAllAsync(dep.token));
        continue;
      }
      const depDef = this.primaryDef.get(dep.token);
      if (!depDef) {
        if (dep.optional) {
          resolved.push(undefined);
          continue;
        }
        throw new MissingDependencyError(tokenName(dep.token));
      }
      if (depDef.scope === 'singleton') {
        const cached = this.singletonCache.get(dep.token);
        if (cached !== undefined && cached !== UNRESOLVED) {
          resolved.push(cached);
          continue;
        }
      }
      resolved.push(await this.resolveAsyncRaw(depDef, false));
    }
    return resolved;
  }

  private resolveSync<T>(def: BeanDefinition): T {
    const deps = this.resolveDepsSync(def.dependencies);
    const raw = def.factory(...deps);
    if (raw instanceof Promise) {
      // Mark as unresolved so sync get() knows to throw
      if (def.scope === 'singleton') {
        this.singletonCache.set(def.token, UNRESOLVED);
      }
      throw new AsyncBeanNotReadyError(tokenName(def.token));
    }
    const instance = this.applyPostProcessorsSync(raw as T, def);
    if (def.scope === 'singleton') {
      this.singletonCache.set(def.token, instance);
    }
    return instance;
  }

  private async resolveAsync<T>(def: BeanDefinition): Promise<T> {
    return this.resolveAsyncRaw(def, false) as Promise<T>;
  }

  /**
   * @param skipPostProcessors - true when resolving post-processors themselves
   */
  private async resolveAsyncRaw(
    def: BeanDefinition,
    skipPostProcessors: boolean,
  ): Promise<unknown> {
    // Check cache again (may have been resolved while awaiting)
    if (def.scope === 'singleton') {
      const cached = this.singletonCache.get(def.token);
      if (cached !== undefined && cached !== UNRESOLVED) return cached;
    }

    const deps = await this.resolveDepsAsync(def.dependencies);
    let instance = await def.factory(...deps);

    if (!skipPostProcessors) {
      instance = await this.applyPostProcessorsAsync(instance, def);
    }

    if (def.scope === 'singleton') {
      this.singletonCache.set(def.token, instance);
    }
    return instance;
  }

  private applyPostProcessorsSync<T>(bean: T, def: BeanDefinition): T {
    let current = bean;
    for (const pp of this.postProcessors) {
      if (pp.beforeInit) {
        const result = pp.beforeInit(current, def as BeanDefinition<T>);
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new AsyncBeanNotReadyError(tokenName(def.token));
        }
        current = result as T;
      }
    }
    // @PostConstruct — runs after beforeInit, before afterInit
    const postConstructMethods = def.metadata.postConstructMethods as
      | string[]
      | undefined;
    if (postConstructMethods) {
      for (const methodName of postConstructMethods) {
        const result = (current as Record<string, () => unknown>)[methodName]();
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new AsyncBeanNotReadyError(tokenName(def.token));
        }
      }
    }
    for (const pp of this.postProcessors) {
      if (pp.afterInit) {
        const result = pp.afterInit(current, def as BeanDefinition<T>);
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new AsyncBeanNotReadyError(tokenName(def.token));
        }
        current = result as T;
      }
    }
    return current;
  }

  private async applyPostProcessorsAsync(
    bean: unknown,
    def: BeanDefinition,
  ): Promise<unknown> {
    let current = bean;
    for (const pp of this.postProcessors) {
      if (pp.beforeInit) {
        current = await pp.beforeInit(current, def);
      }
    }
    // @PostConstruct — runs after beforeInit, before afterInit
    const postConstructMethods = def.metadata.postConstructMethods as
      | string[]
      | undefined;
    if (postConstructMethods) {
      for (const methodName of postConstructMethods) {
        await (current as Record<string, () => unknown>)[methodName]();
      }
    }
    for (const pp of this.postProcessors) {
      if (pp.afterInit) {
        current = await pp.afterInit(current, def);
      }
    }
    return current;
  }
}

function tokenName(token: Token): string {
  if (typeof token === 'function') {
    return token.name || 'Anonymous';
  }
  return token.description;
}
