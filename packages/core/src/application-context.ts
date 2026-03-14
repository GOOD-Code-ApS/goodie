import type {
  ComponentDefinition,
  Dependency,
} from './component-definition.js';
import type { ComponentPostProcessor } from './component-post-processor.js';
import {
  AsyncBeanNotReadyError,
  ContextClosedError,
  MissingDependencyError,
} from './errors.js';
import type { InjectionToken } from './injection-token.js';
import { RequestScopeManager } from './request-scope.js';
import { isMetricsEnabled, StartupMetrics } from './startup-metrics.js';
import { topoSort } from './topo-sort.js';
import type { AbstractConstructor, Constructor } from './types.js';

/** Shape of conditional rules stored in `metadata.conditionalRules` by the transformer. */
interface ConditionalRule {
  type: 'onEnv' | 'onProperty' | 'onMissingBean';
  envVar?: string;
  expectedValue?: string;
  expectedValues?: string[];
  key?: string;
  tokenClassName?: string;
  tokenImportPath?: string;
}

type Token = InjectionToken<unknown> | Constructor | AbstractConstructor;

const UNRESOLVED = Symbol('UNRESOLVED');

/**
 * The runtime dependency injection container.
 *
 * Created from an array of ComponentDefinitions (produced by the compile-time
 * transformer or built manually). Manages scoping, lazy/eager instantiation,
 * async deduplication, and ComponentPostProcessor hooks.
 */
export class ApplicationContext {
  private readonly defsByToken = new Map<Token, ComponentDefinition[]>();
  private readonly primaryDef = new Map<Token, ComponentDefinition>();
  private readonly singletonCache = new Map<Token, unknown>();
  private readonly asyncInFlight = new Map<Token, Promise<unknown>>();
  private readonly postProcessors: ComponentPostProcessor[] = [];
  /** Names of beans excluded by conditional rules, with reason strings. */
  private readonly filteredOutBeans = new Map<string, string>();
  private closed = false;
  private startupMetrics: StartupMetrics | undefined;

  constructor(private readonly sortedDefs: ComponentDefinition[]) {
    for (const def of sortedDefs) {
      const existing = this.defsByToken.get(def.token);
      if (existing) {
        existing.push(def);
      } else {
        this.defsByToken.set(def.token, [def]);
      }
      // @Primary wins; otherwise last definition wins (typical DI override semantics)
      const currentPrimary = this.primaryDef.get(def.token);
      if (
        !currentPrimary ||
        def.metadata.primary ||
        !currentPrimary.metadata.primary
      ) {
        this.primaryDef.set(def.token, def);
      }

      // Register under base tokens so getAll(BaseClass) finds subtypes
      if (def.baseTokens) {
        for (const baseToken of def.baseTokens) {
          const baseDefs = this.defsByToken.get(baseToken);
          if (baseDefs) {
            baseDefs.push(def);
          } else {
            this.defsByToken.set(baseToken, [def]);
          }
          const currentBasePrimary = this.primaryDef.get(baseToken);
          if (
            !currentBasePrimary ||
            def.metadata.primary ||
            !currentBasePrimary.metadata.primary
          ) {
            this.primaryDef.set(baseToken, def);
          }
        }
      }
    }
  }

  /**
   * Build and initialize an ApplicationContext.
   *
   * 1. Topologically sorts definitions
   * 2. Validates required dependencies exist
   * 3. Discovers and initializes ComponentPostProcessors
   * 4. Eagerly resolves beans marked with `eager: true`
   */
  static async create(
    definitions: ComponentDefinition[],
    options?: { preSorted?: boolean },
  ): Promise<ApplicationContext> {
    const metrics = isMetricsEnabled() ? new StartupMetrics() : undefined;
    const totalStart = metrics ? performance.now() : 0;

    // Evaluate conditional rules at runtime (env, config properties, missing beans)
    const { beans: filtered, filteredOut } =
      filterConditionalBeans(definitions);

    const sorted = metrics
      ? metrics.timeStageSync('topoSort', () =>
          options?.preSorted ? filtered : topoSort(filtered),
        )
      : options?.preSorted
        ? filtered
        : topoSort(filtered);

    const ctx = new ApplicationContext(sorted);
    for (const [name, reason] of filteredOut) {
      ctx.filteredOutBeans.set(name, reason);
    }
    ctx.startupMetrics = metrics;

    // Self-register so beans can inject ApplicationContext.
    ctx.singletonCache.set(ApplicationContext, ctx);
    const selfDef: ComponentDefinition = {
      token: ApplicationContext,
      scope: 'singleton',
      dependencies: [],
      factory: () => ctx,
      eager: false,
      metadata: {},
    };
    ctx.defsByToken.set(ApplicationContext, [selfDef]);
    ctx.primaryDef.set(ApplicationContext, selfDef);

    if (metrics) {
      metrics.timeStageSync('validateDependencies', () =>
        ctx.validateDependencies(),
      );
      await metrics.timeStage('initPostProcessors', () =>
        ctx.initPostProcessors(),
      );
      await metrics.timeStage('initEagerBeans', () => ctx.initEagerBeans());
      metrics.setTotal(performance.now() - totalStart);
      metrics.print();
    } else {
      ctx.validateDependencies();
      await ctx.initPostProcessors();
      await ctx.initEagerBeans();
    }

    return ctx;
  }

  /**
   * Synchronously get a bean. Throws if:
   * - The bean is async and hasn't been resolved yet
   * - The token has no provider
   * - The context is closed
   */
  get<T>(
    token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
  ): T {
    this.assertOpen();
    const def = this.primaryDef.get(token as Token);
    if (!def) {
      throw this.missingDependencyWithSuggestions(token as Token);
    }

    if (def.scope === 'singleton') {
      // Check cache under both the requested token and the def's actual token
      // (they differ when resolving via baseTokens, e.g. abstract → concrete)
      const cached =
        this.singletonCache.get(token as Token) ??
        this.singletonCache.get(def.token);
      if (cached === UNRESOLVED || this.asyncInFlight.has(def.token)) {
        throw new AsyncBeanNotReadyError(tokenName(def.token));
      }
      if (cached !== undefined) {
        return cached as T;
      }
      // Attempt synchronous resolution
      const instance = this.resolveSync<T>(def);
      return instance;
    }

    if (def.scope === 'request') {
      return this.getRequestScopedInstance<T>(def);
    }

    // Prototype: new instance every time
    return this.resolveSync<T>(def);
  }

  /**
   * Asynchronously get a bean. Always works, even for async factories.
   */
  async getAsync<T>(
    token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
  ): Promise<T> {
    this.assertOpen();
    const def = this.primaryDef.get(token as Token);
    if (!def) {
      throw this.missingDependencyWithSuggestions(token as Token);
    }

    if (def.scope === 'singleton') {
      const cached =
        this.singletonCache.get(token as Token) ??
        this.singletonCache.get(def.token);
      if (cached !== undefined && cached !== UNRESOLVED) {
        return cached as T;
      }

      // Deduplicate concurrent async resolution
      const inFlight =
        this.asyncInFlight.get(token as Token) ??
        this.asyncInFlight.get(def.token);
      if (inFlight) {
        return inFlight as Promise<T>;
      }

      const promise = this.resolveAsync<T>(def);
      this.asyncInFlight.set(def.token, promise);
      try {
        const instance = await promise;
        return instance;
      } finally {
        this.asyncInFlight.delete(def.token);
      }
    }

    if (def.scope === 'request') {
      return this.getRequestScopedInstanceAsync<T>(def);
    }

    // Prototype
    return this.resolveAsync<T>(def);
  }

  /**
   * Get all beans registered under the given token.
   * Throws if any bean has an async factory — use `getAllAsync()` instead.
   */
  getAll<T>(
    token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
  ): T[] {
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
    token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
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
   * Returns a shallow defensive copy of the bean definitions used to build this context,
   * including the self-registered ApplicationContext definition.
   */
  getDefinitions(): readonly ComponentDefinition[] {
    const selfDef = this.primaryDef.get(ApplicationContext);
    return selfDef ? [selfDef, ...this.sortedDefs] : [...this.sortedDefs];
  }

  /**
   * Returns startup metrics if GOODIE_DEBUG was enabled during creation,
   * or undefined otherwise.
   */
  getStartupMetrics(): StartupMetrics | undefined {
    return this.startupMetrics;
  }

  /**
   * Close the context. Calls `@OnDestroy` methods on instantiated singletons
   * in reverse-topological order (dependents destroyed before dependencies),
   * then clears caches and rejects further calls.
   */
  async close(): Promise<void> {
    this.closed = true;

    const errors: Error[] = [];
    for (const def of [...this.sortedDefs].reverse()) {
      if (def.scope !== 'singleton') continue;
      const methods = def.metadata.onDestroyMethods as string[] | undefined;
      if (!methods || methods.length === 0) continue;

      const instance = this.singletonCache.get(def.token);
      if (instance === undefined || instance === UNRESOLVED) continue;

      for (const methodName of methods) {
        try {
          await (instance as Record<string, () => unknown>)[methodName]();
        } catch (err) {
          const name = tokenName(def.token);
          const original = err instanceof Error ? err.message : String(err);
          errors.push(
            new Error(
              `Failed to execute @OnDestroy on ${name}.${methodName}(): ${original}`,
              { cause: err },
            ),
          );
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
          const depName = tokenName(dep.token);
          throw new MissingDependencyError(
            depName,
            tokenName(def.token),
            this.buildSuggestionHint(depName),
          );
        }
      }
    }
  }

  private async initPostProcessors(): Promise<void> {
    for (const def of this.sortedDefs) {
      if (def.metadata.isComponentPostProcessor) {
        const processor = await this.resolveAsyncRaw(def, true);
        this.postProcessors.push(processor as ComponentPostProcessor);
      }
    }
  }

  private async initEagerBeans(): Promise<void> {
    for (const def of this.sortedDefs) {
      if (def.eager && !def.metadata.isComponentPostProcessor) {
        if (this.startupMetrics) {
          const start = performance.now();
          await this.resolveAsyncRaw(def, false);
          this.startupMetrics.recordBean(
            tokenName(def.token),
            performance.now() - start,
          );
        } else {
          await this.resolveAsyncRaw(def, false);
        }
      }
    }
  }

  private resolveDepsSync(
    deps: Dependency[],
    parentDef?: ComponentDefinition,
  ): unknown[] {
    return deps.map((dep) => {
      if (dep.collection) {
        return this.getAll(dep.token);
      }
      const depDef = this.primaryDef.get(dep.token);
      if (!depDef) {
        if (dep.optional) return undefined;
        const depName = tokenName(dep.token);
        throw new MissingDependencyError(
          depName,
          parentDef ? tokenName(parentDef.token) : undefined,
          this.buildSuggestionHint(depName),
        );
      }
      // Singleton depending on request-scoped bean → inject a proxy
      if (depDef.scope === 'request' && parentDef?.scope === 'singleton') {
        return this.createRequestScopeProxy(depDef);
      }
      if (depDef.scope === 'singleton') {
        const cached =
          this.singletonCache.get(dep.token) ??
          this.singletonCache.get(depDef.token);
        if (cached !== undefined && cached !== UNRESOLVED) return cached;
      }
      if (depDef.scope === 'request') {
        return this.getRequestScopedInstance(depDef);
      }
      return this.resolveSync(depDef);
    });
  }

  private async resolveDepsAsync(
    deps: Dependency[],
    parentDef?: ComponentDefinition,
  ): Promise<unknown[]> {
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
        const depName = tokenName(dep.token);
        throw new MissingDependencyError(
          depName,
          parentDef ? tokenName(parentDef.token) : undefined,
          this.buildSuggestionHint(depName),
        );
      }
      if (depDef.scope === 'request' && parentDef?.scope === 'singleton') {
        resolved.push(this.createRequestScopeProxy(depDef));
        continue;
      }
      if (depDef.scope === 'singleton') {
        const cached =
          this.singletonCache.get(dep.token) ??
          this.singletonCache.get(depDef.token);
        if (cached !== undefined && cached !== UNRESOLVED) {
          resolved.push(cached);
          continue;
        }
      }
      if (depDef.scope === 'request') {
        resolved.push(await this.getRequestScopedInstanceAsync(depDef));
        continue;
      }
      resolved.push(await this.resolveAsyncRaw(depDef, false));
    }
    return resolved;
  }

  private resolveSync<T>(def: ComponentDefinition): T {
    const deps = this.resolveDepsSync(def.dependencies, def);
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

  private async resolveAsync<T>(def: ComponentDefinition): Promise<T> {
    return this.resolveAsyncRaw(def, false) as Promise<T>;
  }

  /**
   * @param skipPostProcessors - true when resolving post-processors themselves
   */
  private async resolveAsyncRaw(
    def: ComponentDefinition,
    skipPostProcessors: boolean,
  ): Promise<unknown> {
    // Check cache again (may have been resolved while awaiting)
    if (def.scope === 'singleton') {
      const cached = this.singletonCache.get(def.token);
      if (cached !== undefined && cached !== UNRESOLVED) return cached;
    }

    const deps = await this.resolveDepsAsync(def.dependencies, def);
    let instance = await def.factory(...deps);

    if (!skipPostProcessors) {
      instance = await this.applyPostProcessorsAsync(instance, def);
    }

    if (def.scope === 'singleton') {
      this.singletonCache.set(def.token, instance);
    }
    return instance;
  }

  /**
   * Resolve a request-scoped bean from the current request's store.
   * Creates and caches the instance if not yet created in this scope.
   */
  private getRequestScopedInstance<T>(def: ComponentDefinition): T {
    const store = RequestScopeManager.getStore();
    if (!store) {
      throw new Error(
        `No active request scope for bean '${tokenName(def.token)}'. ` +
          `Ensure the request is running inside RequestScopeManager.run().`,
      );
    }
    const cached = store.get(def.token);
    if (cached !== undefined) return cached as T;

    const deps = this.resolveDepsSync(def.dependencies, def);
    const raw = def.factory(...deps);
    if (raw instanceof Promise) {
      throw new AsyncBeanNotReadyError(tokenName(def.token));
    }
    const instance = this.applyPostProcessorsSync(raw as T, def);
    store.set(def.token, instance);
    return instance;
  }

  /**
   * Async variant of getRequestScopedInstance. Supports beans with async
   * factories or async @OnInit (e.g. D1KyselyDatabase).
   */
  private async getRequestScopedInstanceAsync<T>(
    def: ComponentDefinition,
  ): Promise<T> {
    const store = RequestScopeManager.getStore();
    if (!store) {
      throw new Error(
        `No active request scope for bean '${tokenName(def.token)}'. ` +
          `Ensure the request is running inside RequestScopeManager.run().`,
      );
    }
    const cached = store.get(def.token);
    if (cached !== undefined) return cached as T;

    const deps = await this.resolveDepsAsync(def.dependencies, def);
    let instance = await def.factory(...deps);
    instance = await this.applyPostProcessorsAsync(instance, def);
    store.set(def.token, instance);
    return instance as T;
  }

  /**
   * Create a scoped proxy that delegates to the current request scope's instance.
   * Uses a compile-time generated proxy factory (from the transformer) when available.
   * The factory creates an Object.create-based delegation object with the correct
   * prototype chain — no runtime Proxy or reflection needed.
   */
  private createRequestScopeProxy(def: ComponentDefinition): unknown {
    const resolve = () => this.getRequestScopedInstance(def);
    const factory = def.metadata.scopedProxyFactory as
      | ((resolve: () => unknown) => unknown)
      | undefined;
    if (factory) {
      return factory(resolve);
    }
    throw new Error(
      `No scoped proxy factory for request-scoped bean '${tokenName(def.token)}'. ` +
        `Ensure the transformer generated a scopedProxyFactory in the bean metadata.`,
    );
  }

  private applyPostProcessorsSync<T>(bean: T, def: ComponentDefinition): T {
    let current = bean;
    for (const pp of this.postProcessors) {
      if (pp.beforeInit) {
        const result = pp.beforeInit(current, def as ComponentDefinition<T>);
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new AsyncBeanNotReadyError(tokenName(def.token));
        }
        current = result as T;
      }
    }
    // @OnInit — runs after beforeInit, before afterInit
    const onInitMethods = def.metadata.onInitMethods as string[] | undefined;
    if (onInitMethods) {
      for (const methodName of onInitMethods) {
        let result: unknown;
        try {
          result = (current as Record<string, () => unknown>)[methodName]();
        } catch (err) {
          const name = tokenName(def.token);
          const original = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Failed to execute @OnInit on ${name}.${methodName}(): ${original}`,
            { cause: err },
          );
        }
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new AsyncBeanNotReadyError(tokenName(def.token));
        }
      }
    }
    for (const pp of this.postProcessors) {
      if (pp.afterInit) {
        const result = pp.afterInit(current, def as ComponentDefinition<T>);
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
    def: ComponentDefinition,
  ): Promise<unknown> {
    let current = bean;
    for (const pp of this.postProcessors) {
      if (pp.beforeInit) {
        current = await pp.beforeInit(current, def);
      }
    }
    // @OnInit — runs after beforeInit, before afterInit
    const onInitMethods = def.metadata.onInitMethods as string[] | undefined;
    if (onInitMethods) {
      for (const methodName of onInitMethods) {
        try {
          await (current as Record<string, () => unknown>)[methodName]();
        } catch (err) {
          const name = tokenName(def.token);
          const original = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Failed to execute @OnInit on ${name}.${methodName}(): ${original}`,
            { cause: err },
          );
        }
      }
    }
    for (const pp of this.postProcessors) {
      if (pp.afterInit) {
        current = await pp.afterInit(current, def);
      }
    }
    return current;
  }

  private missingDependencyWithSuggestions(
    token: Token,
  ): MissingDependencyError {
    const name = tokenName(token);
    return new MissingDependencyError(
      name,
      undefined,
      this.buildSuggestionHint(name),
    );
  }

  private buildSuggestionHint(name: string): string | undefined {
    // Check if the bean was excluded by a conditional rule
    const conditionalReason = this.filteredOutBeans.get(name);
    if (conditionalReason) {
      return `A bean '${name}' exists but was excluded by: ${conditionalReason}`;
    }
    const registered = Array.from(this.primaryDef.keys()).map(tokenName);
    const similar = findSimilar(name, registered);
    return similar.length > 0
      ? `Did you mean: ${similar.join(', ')}?`
      : undefined;
  }
}

function tokenName(token: Token): string {
  if (typeof token === 'function') {
    return token.name || 'Anonymous';
  }
  return token.description;
}

// NOTE: findSimilar/levenshtein are duplicated in packages/transformer/src/transformer-errors.ts
// (separate packages, no shared util). Keep threshold logic in sync.
function findSimilar(
  name: string,
  candidates: string[],
  maxResults = 3,
): string[] {
  const threshold = Math.max(3, Math.ceil(name.length / 2));
  const lower = name.toLowerCase();
  const scored = candidates
    .map((c) => ({ name: c, dist: levenshtein(lower, c.toLowerCase()) }))
    .filter((s) => s.dist <= threshold && s.dist > 0)
    .sort((a, b) => a.dist - b.dist);
  return scored.slice(0, maxResults).map((s) => s.name);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Filter beans based on conditional rules stored in `metadata.conditionalRules`.
 * Evaluated at runtime following the Micronaut pattern — the transformer records
 * the rules, the container evaluates them.
 *
 * Order: onEnv → onProperty → onMissingBean (since missingBean depends on what remains).
 * All conditions on a single bean use AND logic.
 */
function filterConditionalBeans(definitions: ComponentDefinition[]): {
  beans: ComponentDefinition[];
  filteredOut: Map<string, string>;
} {
  const filteredOut = new Map<string, string>();

  // Quick exit if no beans have conditional rules
  const hasAnyRules = definitions.some(
    (d) =>
      d.metadata.conditionalRules &&
      (d.metadata.conditionalRules as ConditionalRule[]).length > 0,
  );
  if (!hasAnyRules) return { beans: definitions, filteredOut };

  // Lazily resolve config for @ConditionalOnProperty
  let config: Record<string, unknown> | undefined;

  // Phase 1: filter by onEnv and onProperty
  let remaining = definitions.filter((def) => {
    const rules = def.metadata.conditionalRules as
      | ConditionalRule[]
      | undefined;
    if (!rules || rules.length === 0) return true;

    for (const rule of rules) {
      if (rule.type === 'onEnv') {
        const envValue = process.env[rule.envVar!];
        if (rule.expectedValue !== undefined) {
          if (envValue !== rule.expectedValue) {
            filteredOut.set(
              tokenName(def.token),
              `@ConditionalOnEnv('${rule.envVar}', '${rule.expectedValue}') — env is '${envValue ?? '<undefined>'}'`,
            );
            return false;
          }
        } else {
          if (envValue === undefined) {
            filteredOut.set(
              tokenName(def.token),
              `@ConditionalOnEnv('${rule.envVar}') — env var is not set`,
            );
            return false;
          }
        }
      } else if (rule.type === 'onProperty') {
        if (!config) {
          config = resolveConfigFromDefinitions(definitions);
        }
        const propValue = config[rule.key!];
        if (rule.expectedValues !== undefined) {
          if (!rule.expectedValues.includes(String(propValue))) {
            filteredOut.set(
              tokenName(def.token),
              `@ConditionalOnProperty('${rule.key}', { havingValue: [${rule.expectedValues.map((v) => `'${v}'`).join(', ')}] }) — property is '${propValue ?? '<undefined>'}'`,
            );
            return false;
          }
        } else if (rule.expectedValue !== undefined) {
          if (String(propValue) !== rule.expectedValue) {
            filteredOut.set(
              tokenName(def.token),
              `@ConditionalOnProperty('${rule.key}', '${rule.expectedValue}') — property is '${propValue ?? '<undefined>'}'`,
            );
            return false;
          }
        } else {
          if (propValue === undefined) {
            filteredOut.set(
              tokenName(def.token),
              `@ConditionalOnProperty('${rule.key}') — property is not set`,
            );
            return false;
          }
        }
      }
      // onMissingBean handled in phase 2
    }
    return true;
  });

  // Phase 2: filter by onMissingBean (evaluated against remaining beans)
  const registeredNames = new Set<string>();
  for (const def of remaining) {
    registeredNames.add(tokenName(def.token));
    // Also register base token names for subtype matching
    if (def.baseTokens) {
      for (const base of def.baseTokens) {
        registeredNames.add(tokenName(base as Token));
      }
    }
  }

  remaining = remaining.filter((def) => {
    const rules = def.metadata.conditionalRules as
      | ConditionalRule[]
      | undefined;
    if (!rules || rules.length === 0) return true;

    for (const rule of rules) {
      if (rule.type !== 'onMissingBean') continue;

      const ownName = tokenName(def.token);
      // Bean is excluded when the target bean IS present (it's "on *missing* bean")
      if (
        registeredNames.has(rule.tokenClassName!) &&
        rule.tokenClassName !== ownName
      ) {
        filteredOut.set(
          tokenName(def.token),
          `@ConditionalOnMissing(${rule.tokenClassName}) — bean '${rule.tokenClassName}' is present`,
        );
        return false;
      }
    }
    return true;
  });

  return { beans: remaining, filteredOut };
}

/**
 * Resolve config values for @ConditionalOnProperty evaluation.
 * Finds the __Goodie_Config bean (if present) and calls its factory,
 * which returns the merged config (inlined + process.env + overrides).
 * Falls back to process.env if no config bean exists.
 */
function resolveConfigFromDefinitions(
  definitions: ComponentDefinition[],
): Record<string, unknown> {
  const configDef = definitions.find(
    (d) =>
      typeof d.token !== 'function' &&
      d.token.description === '__Goodie_Config',
  );
  if (configDef) {
    // Config bean has zero dependencies — safe to call factory directly
    const result = configDef.factory();
    if (result && typeof result === 'object') {
      return result as Record<string, unknown>;
    }
  }
  // No config bean — fall back to process.env
  return { ...process.env } as Record<string, unknown>;
}
