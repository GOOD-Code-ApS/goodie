import {
  ApplicationContext,
  type BeanDefinition,
  type Constructor,
  type Dependency,
  DIError,
  InjectionToken,
  OverrideError,
} from '@goodie-ts/core';
import { getMockTarget, MockDefinitionError } from './mock-definition.js';

type Token = InjectionToken<unknown> | Constructor;

function tokenName(token: Token): string {
  if (typeof token === 'function') {
    return token.name || 'Anonymous';
  }
  return token.description;
}

/**
 * Fluent builder for configuring a single bean override.
 */
export class OverrideBuilder<T> {
  constructor(
    private readonly token: Token,
    private readonly commit: (def: BeanDefinition) => void,
    private readonly findOriginal: (token: Token) => BeanDefinition | undefined,
  ) {}

  /**
   * Override with a fixed value instance.
   */
  withValue(value: T): TestContextBuilder {
    const def: BeanDefinition = {
      token: this.token,
      scope: 'singleton',
      dependencies: [],
      factory: () => value,
      eager: false,
      metadata: {},
    };
    this.commit(def);
    return builder;
  }

  /**
   * Override with a replacement class (zero-dependency, `new cls()`).
   */
  with(cls: Constructor<T>): TestContextBuilder {
    const def: BeanDefinition = {
      token: this.token,
      scope: 'singleton',
      dependencies: [],
      factory: () => new cls(),
      eager: false,
      metadata: {},
    };
    this.commit(def);
    return builder;
  }

  /**
   * Override with a custom factory function (sync or async).
   */
  withFactory(factory: () => T | Promise<T>): TestContextBuilder {
    const def: BeanDefinition = {
      token: this.token,
      scope: 'singleton',
      dependencies: [],
      factory,
      eager: false,
      metadata: {},
    };
    this.commit(def);
    return builder;
  }

  /**
   * Override with a factory that receives the original bean's resolved
   * dependencies. Keeps the original dependency list — only replaces the
   * factory function.
   *
   * @example
   * TestContext.from(definitions)
   *   .override(UserService).withDeps((repo: UserRepo) => new MockUserService(repo))
   *   .build()
   */
  withDeps(
    factory: (...deps: unknown[]) => T | Promise<T>,
  ): TestContextBuilder {
    const original = this.findOriginal(this.token);
    const dependencies: Dependency[] = original
      ? [...original.dependencies]
      : [];
    const def: BeanDefinition = {
      token: this.token,
      scope: original?.scope ?? 'singleton',
      dependencies,
      factory,
      eager: original?.eager ?? false,
      metadata: original?.metadata ? { ...original.metadata } : {},
    };
    this.commit(def);
    return builder;
  }
}

// Module-level reference that OverrideBuilder methods return.
// Set by TestContextBuilder before creating OverrideBuilder instances.
let builder: TestContextBuilder;

/**
 * Accumulates bean overrides and builds a fresh ApplicationContext.
 */
export class TestContextBuilder {
  private readonly overrides = new Map<Token, BeanDefinition>();
  private readonly tokenSet: Set<Token>;

  /** @internal — use TestContext.from() */
  constructor(private readonly baseDefs: BeanDefinition[]) {
    this.tokenSet = new Set(baseDefs.map((d) => d.token));
  }

  /**
   * Start overriding a bean identified by its class constructor.
   * Throws OverrideError if the token doesn't exist in the base definitions.
   */
  override<T>(token: Constructor<T> | InjectionToken<T>): OverrideBuilder<T> {
    if (!this.tokenSet.has(token as Token)) {
      throw new OverrideError(tokenName(token as Token));
    }
    builder = this;
    return new OverrideBuilder<T>(
      token as Token,
      (def) => {
        this.overrides.set(def.token, def);
      },
      (t) => this.baseDefs.find((d) => d.token === t),
    );
  }

  /**
   * Register one or more @MockDefinition-annotated classes as overrides.
   *
   * Each class must be decorated with @MockDefinition(target) — the framework
   * resolves the target (Constructor, InjectionToken, or string description),
   * validates it exists, and stores the override (zero-dependency `new cls()`).
   */
  mock(...classes: Constructor[]): TestContextBuilder {
    for (const cls of classes) {
      const target = getMockTarget(cls);
      if (target === undefined) {
        throw new MockDefinitionError(
          `${cls.name || 'Anonymous'} is not annotated with @MockDefinition`,
        );
      }

      const token = this.resolveTarget(target, cls);

      if (!this.tokenSet.has(token)) {
        throw new OverrideError(tokenName(token));
      }

      const def: BeanDefinition = {
        token,
        scope: 'singleton',
        dependencies: [],
        factory: () => new cls(),
        eager: false,
        metadata: {},
      };
      this.overrides.set(token, def);
    }

    return this;
  }

  /**
   * Override specific config keys while preserving the rest.
   * Requires a `__Goodie_Config` bean in the base definitions (generated when `@Value` is used).
   *
   * Wraps the original config factory: `{ ...originalFactory(), ...overrides }`.
   * Last `withConfig()` call wins (consistent with `override()` semantics).
   */
  withConfig(overrides: Record<string, unknown>): TestContextBuilder {
    const configDef = this.baseDefs.find(
      (d) =>
        d.token instanceof InjectionToken &&
        d.token.description === '__Goodie_Config',
    );

    if (!configDef) {
      throw new DIError(
        'No __Goodie_Config bean found — withConfig() requires @Value to be used in at least one bean',
      );
    }

    const existingOverride = this.overrides.get(configDef.token);
    const baseDef = existingOverride ?? configDef;
    const baseFactory = baseDef.factory as () => Record<string, unknown>;
    const overrideDef: BeanDefinition = {
      ...configDef,
      factory: () => ({ ...baseFactory(), ...overrides }),
    };
    this.overrides.set(configDef.token, overrideDef);

    return this;
  }

  /**
   * Resolve a MockDefinition target to a Token usable for override lookup.
   * - Constructor / InjectionToken → returned as-is
   * - string → find InjectionToken in base defs by description (must be unique)
   */
  private resolveTarget(
    target: Constructor | InjectionToken<unknown> | string,
    mockCls: Constructor,
  ): Token {
    if (typeof target === 'string') {
      const matches: InjectionToken<unknown>[] = [];
      for (const def of this.baseDefs) {
        if (
          def.token instanceof InjectionToken &&
          def.token.description === target
        ) {
          matches.push(def.token);
        }
      }

      if (matches.length === 0) {
        throw new MockDefinitionError(
          `${mockCls.name || 'Anonymous'} targets InjectionToken "${target}" but no such token exists in the definitions`,
        );
      }
      if (matches.length > 1) {
        throw new MockDefinitionError(
          `${mockCls.name || 'Anonymous'} targets InjectionToken "${target}" but ${matches.length} tokens share that description — pass the InjectionToken instance directly to disambiguate`,
        );
      }

      return matches[0];
    }
    return target as Token;
  }

  /**
   * Build a fresh ApplicationContext with all overrides applied.
   */
  async build(): Promise<ApplicationContext> {
    const merged = this.baseDefs.map(
      (def) => this.overrides.get(def.token) ?? def,
    );
    return ApplicationContext.create(merged);
  }
}

/**
 * Entry point for creating test-friendly ApplicationContexts with bean overrides.
 */
export class TestContext {
  private constructor() {}

  /**
   * Create a TestContextBuilder from an existing ApplicationContext or raw BeanDefinitions.
   */
  static from(
    source: ApplicationContext | BeanDefinition[],
  ): TestContextBuilder {
    const defs = Array.isArray(source) ? source : source.getDefinitions();
    return new TestContextBuilder([...defs]);
  }
}
