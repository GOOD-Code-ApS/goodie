import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/component-definition.js';
import { InjectionToken } from '../src/injection-token.js';
import type { Scope } from '../src/types.js';

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: ComponentDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T | Promise<T>;
    scope?: Scope;
    eager?: boolean;
    metadata?: Record<string, unknown>;
    baseTokens?: ComponentDefinition<T>['baseTokens'];
  } = {},
): ComponentDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: opts.eager ?? false,
    metadata: opts.metadata ?? {},
    baseTokens: opts.baseTokens,
  };
}

/** Creates a __Goodie_Config bean with the given flattened config values. */
function makeConfigDef(
  config: Record<string, string>,
): ComponentDefinition<Record<string, unknown>> {
  const configToken = new InjectionToken<Record<string, unknown>>(
    '__Goodie_Config',
  );
  return makeDef(configToken, {
    factory: () => ({ ...config, ...process.env }) as Record<string, unknown>,
  });
}

describe('Runtime Conditional Bean Filtering', () => {
  describe('@ConditionalOnEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should include bean when env var matches expected value', async () => {
      process.env.NODE_ENV = 'production';

      class ProdService {}
      const ctx = await ApplicationContext.create([
        makeDef(ProdService, {
          factory: () => new ProdService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onEnv',
                envVar: 'NODE_ENV',
                expectedValue: 'production',
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(ProdService)).toBeInstanceOf(ProdService);
      await ctx.close();
    });

    it('should exclude bean when env var does not match expected value', async () => {
      process.env.NODE_ENV = 'development';

      class ProdService {}
      const ctx = await ApplicationContext.create([
        makeDef(ProdService, {
          factory: () => new ProdService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onEnv',
                envVar: 'NODE_ENV',
                expectedValue: 'production',
              },
            ],
          },
        }),
      ]);

      expect(() => ctx.get(ProdService)).toThrow();
      await ctx.close();
    });

    it('should include bean when env var exists (no value check)', async () => {
      process.env.FEATURE_FLAG = 'anything';

      class FeatureService {}
      const ctx = await ApplicationContext.create([
        makeDef(FeatureService, {
          factory: () => new FeatureService(),
          metadata: {
            conditionalRules: [{ type: 'onEnv', envVar: 'FEATURE_FLAG' }],
          },
        }),
      ]);

      expect(ctx.get(FeatureService)).toBeInstanceOf(FeatureService);
      await ctx.close();
    });

    it('should exclude bean when env var is missing (no value check)', async () => {
      delete process.env.FEATURE_FLAG;

      class FeatureService {}
      const ctx = await ApplicationContext.create([
        makeDef(FeatureService, {
          factory: () => new FeatureService(),
          metadata: {
            conditionalRules: [{ type: 'onEnv', envVar: 'FEATURE_FLAG' }],
          },
        }),
      ]);

      expect(() => ctx.get(FeatureService)).toThrow();
      await ctx.close();
    });

    it('should include bean when env var is empty string (existence check)', async () => {
      process.env.FEATURE_FLAG = '';

      class EmptyEnvService {}
      const ctx = await ApplicationContext.create([
        makeDef(EmptyEnvService, {
          factory: () => new EmptyEnvService(),
          metadata: {
            conditionalRules: [{ type: 'onEnv', envVar: 'FEATURE_FLAG' }],
          },
        }),
      ]);

      expect(ctx.get(EmptyEnvService)).toBeInstanceOf(EmptyEnvService);
      await ctx.close();
    });
  });

  describe('@ConditionalOnProperty', () => {
    it('should include bean when property matches expected value', async () => {
      class FeatureService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'feature.enabled': 'true' }),
        makeDef(FeatureService, {
          factory: () => new FeatureService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'feature.enabled',
                expectedValue: 'true',
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(FeatureService)).toBeInstanceOf(FeatureService);
      await ctx.close();
    });

    it('should exclude bean when property does not match expected value', async () => {
      class FeatureService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'feature.enabled': 'false' }),
        makeDef(FeatureService, {
          factory: () => new FeatureService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'feature.enabled',
                expectedValue: 'true',
              },
            ],
          },
        }),
      ]);

      expect(() => ctx.get(FeatureService)).toThrow();
      await ctx.close();
    });

    it('should include bean when property exists (no value check)', async () => {
      class DbService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.url': 'postgres://localhost' }),
        makeDef(DbService, {
          factory: () => new DbService(),
          metadata: {
            conditionalRules: [{ type: 'onProperty', key: 'datasource.url' }],
          },
        }),
      ]);

      expect(ctx.get(DbService)).toBeInstanceOf(DbService);
      await ctx.close();
    });

    it('should exclude bean when property is absent', async () => {
      class DbService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({}),
        makeDef(DbService, {
          factory: () => new DbService(),
          metadata: {
            conditionalRules: [{ type: 'onProperty', key: 'datasource.url' }],
          },
        }),
      ]);

      expect(() => ctx.get(DbService)).toThrow();
      await ctx.close();
    });

    it('should include bean when havingValue matches single value', async () => {
      class PgService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.dialect': 'postgres' }),
        makeDef(PgService, {
          factory: () => new PgService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValue: 'postgres',
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(PgService)).toBeInstanceOf(PgService);
      await ctx.close();
    });

    it('should exclude bean when havingValue does not match', async () => {
      class PgService {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.dialect': 'mysql' }),
        makeDef(PgService, {
          factory: () => new PgService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValue: 'postgres',
              },
            ],
          },
        }),
      ]);

      expect(() => ctx.get(PgService)).toThrow();
      await ctx.close();
    });

    it('should include bean when havingValue array contains the config value', async () => {
      class ConnStringDb {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.dialect': 'neon' }),
        makeDef(ConnStringDb, {
          factory: () => new ConnStringDb(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValues: ['postgres', 'mysql', 'neon'],
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(ConnStringDb)).toBeInstanceOf(ConnStringDb);
      await ctx.close();
    });

    it('should exclude bean when havingValue array does not contain the config value', async () => {
      class ConnStringDb {}
      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.dialect': 'd1' }),
        makeDef(ConnStringDb, {
          factory: () => new ConnStringDb(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValues: ['postgres', 'mysql', 'neon'],
              },
            ],
          },
        }),
      ]);

      expect(() => ctx.get(ConnStringDb)).toThrow();
      await ctx.close();
    });

    it('should coerce non-string property values with String() for comparison', async () => {
      class RetryService {}
      const configToken = new InjectionToken<Record<string, unknown>>(
        '__Goodie_Config',
      );
      const ctx = await ApplicationContext.create([
        makeDef(configToken, {
          // Factory returns numeric value (simulates JSON parse)
          factory: () => ({ 'feature.retries': 3 }) as Record<string, unknown>,
        }),
        makeDef(RetryService, {
          factory: () => new RetryService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'feature.retries',
                expectedValue: '3',
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(RetryService)).toBeInstanceOf(RetryService);
      await ctx.close();
    });
  });

  describe('@ConditionalOnMissing', () => {
    it('should exclude bean when target bean exists', async () => {
      class ServiceA {}
      class FallbackService {}

      const ctx = await ApplicationContext.create([
        makeDef(ServiceA, { factory: () => new ServiceA() }),
        makeDef(FallbackService, {
          factory: () => new FallbackService(),
          metadata: {
            conditionalRules: [
              { type: 'onMissing', tokenClassName: 'ServiceA' },
            ],
          },
        }),
      ]);

      expect(ctx.get(ServiceA)).toBeInstanceOf(ServiceA);
      expect(() => ctx.get(FallbackService)).toThrow();
      await ctx.close();
    });

    it('should include bean when target bean does not exist', async () => {
      class FallbackService {}

      const ctx = await ApplicationContext.create([
        makeDef(FallbackService, {
          factory: () => new FallbackService(),
          metadata: {
            conditionalRules: [
              { type: 'onMissing', tokenClassName: 'ServiceA' },
            ],
          },
        }),
      ]);

      expect(ctx.get(FallbackService)).toBeInstanceOf(FallbackService);
      await ctx.close();
    });
  });

  describe('Multiple conditions (AND logic)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should include bean only when all conditions are met', async () => {
      process.env.NODE_ENV = 'production';
      process.env.FEATURE_FLAG = 'enabled';

      class MultiCondService {}
      const ctx = await ApplicationContext.create([
        makeDef(MultiCondService, {
          factory: () => new MultiCondService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onEnv',
                envVar: 'NODE_ENV',
                expectedValue: 'production',
              },
              { type: 'onEnv', envVar: 'FEATURE_FLAG' },
            ],
          },
        }),
      ]);

      expect(ctx.get(MultiCondService)).toBeInstanceOf(MultiCondService);
      await ctx.close();
    });

    it('should exclude bean when any condition fails', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.FEATURE_FLAG;

      class MultiCondService {}
      const ctx = await ApplicationContext.create([
        makeDef(MultiCondService, {
          factory: () => new MultiCondService(),
          metadata: {
            conditionalRules: [
              {
                type: 'onEnv',
                envVar: 'NODE_ENV',
                expectedValue: 'production',
              },
              { type: 'onEnv', envVar: 'FEATURE_FLAG' },
            ],
          },
        }),
      ]);

      expect(() => ctx.get(MultiCondService)).toThrow();
      await ctx.close();
    });
  });

  describe('Unconditional beans unaffected', () => {
    it('should not filter beans without conditional decorators', async () => {
      class RegularService {}
      const ctx = await ApplicationContext.create([
        makeDef(RegularService, { factory: () => new RegularService() }),
      ]);

      expect(ctx.get(RegularService)).toBeInstanceOf(RegularService);
      await ctx.close();
    });
  });

  describe('Conditional bean with dependents', () => {
    it('should throw MissingDependencyError when required dep was filtered out', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, NODE_ENV: 'development' };

      try {
        class ProdService {}
        class Consumer {}

        await expect(
          ApplicationContext.create([
            makeDef(ProdService, {
              factory: () => new ProdService(),
              metadata: {
                conditionalRules: [
                  {
                    type: 'onEnv',
                    envVar: 'NODE_ENV',
                    expectedValue: 'production',
                  },
                ],
              },
            }),
            makeDef(Consumer, {
              deps: [dep(ProdService)],
              factory: (ps: unknown) => {
                const c = new Consumer();
                (c as any).prodService = ps;
                return c;
              },
            }),
          ]),
        ).rejects.toThrow('ProdService');
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('Library bean scenario — dialect selection via config', () => {
    it('should activate only the bean matching the configured dialect', async () => {
      abstract class KyselyDatabase {}
      class PostgresKyselyDatabase extends KyselyDatabase {}
      class MysqlKyselyDatabase extends KyselyDatabase {}

      const ctx = await ApplicationContext.create([
        makeConfigDef({ 'datasource.dialect': 'postgres' }),
        makeDef(PostgresKyselyDatabase, {
          factory: () => new PostgresKyselyDatabase(),
          baseTokens: [KyselyDatabase],
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValue: 'postgres',
              },
            ],
          },
        }),
        makeDef(MysqlKyselyDatabase, {
          factory: () => new MysqlKyselyDatabase(),
          baseTokens: [KyselyDatabase],
          metadata: {
            conditionalRules: [
              {
                type: 'onProperty',
                key: 'datasource.dialect',
                expectedValue: 'mysql',
              },
            ],
          },
        }),
      ]);

      expect(ctx.get(KyselyDatabase)).toBeInstanceOf(PostgresKyselyDatabase);
      expect(() => ctx.get(MysqlKyselyDatabase)).toThrow();
      await ctx.close();
    });
  });
});
