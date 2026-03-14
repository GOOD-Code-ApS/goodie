import { describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/bean-definition.js';
import { MissingDependencyError } from '../src/errors.js';

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: ComponentDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T | Promise<T>;
    metadata?: Record<string, unknown>;
    eager?: boolean;
  } = {},
): ComponentDefinition<T> {
  return {
    token,
    scope: 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: opts.eager ?? false,
    metadata: opts.metadata ?? {},
  };
}

describe('Error messages', () => {
  describe('MissingDependencyError suggestions', () => {
    it('should suggest similar token names on get()', async () => {
      class UserService {}
      const ctx = await ApplicationContext.create([
        makeDef(UserService, { factory: () => new UserService() }),
      ]);

      class UserServce {} // typo
      expect(() => ctx.get(UserServce)).toThrow(MissingDependencyError);
      expect(() => ctx.get(UserServce)).toThrow(/Did you mean/);
      expect(() => ctx.get(UserServce)).toThrow(/UserService/);
    });

    it('should include requiredBy on dependency resolution failure', async () => {
      class Missing {}
      class Consumer {
        constructor(readonly m: Missing) {}
      }
      try {
        await ApplicationContext.create([
          makeDef(Consumer, {
            deps: [dep(Missing)],
            factory: (m) => new Consumer(m as Missing),
          }),
        ]);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MissingDependencyError);
        expect((err as Error).message).toContain('Missing');
        expect((err as Error).message).toContain('Consumer');
      }
    });
  });

  describe('@OnInit error wrapping', () => {
    it('should include bean name and method in error', async () => {
      class Broken {
        init() {
          throw new Error('init failed');
        }
      }
      try {
        await ApplicationContext.create([
          makeDef(Broken, {
            factory: () => new Broken(),
            metadata: { onInitMethods: ['init'] },
            eager: true,
          }),
        ]);
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Broken');
        expect((err as Error).message).toContain('init');
        expect((err as Error).message).toContain('init failed');
        expect((err as Error).message).toContain('@OnInit');
      }
    });

    it('should include bean name for async @OnInit errors', async () => {
      class AsyncBroken {
        async init() {
          throw new Error('async init failed');
        }
      }
      try {
        await ApplicationContext.create([
          makeDef(AsyncBroken, {
            factory: () => new AsyncBroken(),
            metadata: { onInitMethods: ['init'] },
            eager: true,
          }),
        ]);
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('AsyncBroken');
        expect((err as Error).message).toContain('async init failed');
      }
    });
  });

  describe('@OnDestroy error wrapping', () => {
    it('should include bean name and method in error', async () => {
      class Destroyable {
        cleanup() {
          throw new Error('cleanup failed');
        }
      }
      const ctx = await ApplicationContext.create([
        makeDef(Destroyable, {
          factory: () => new Destroyable(),
          metadata: { onDestroyMethods: ['cleanup'] },
        }),
      ]);
      // Force instantiation
      ctx.get(Destroyable);

      try {
        await ctx.close();
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Destroyable');
        expect((err as Error).message).toContain('cleanup');
        expect((err as Error).message).toContain('@OnDestroy');
      }
    });
  });
});
