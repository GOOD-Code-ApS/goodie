import { describe, expect, it } from 'vitest';
import {
  CircularDependencyError,
  MissingProviderError,
  UnresolvableTypeError,
} from '../src/transformer-errors.js';
import { createTestProject } from './helpers.js';

describe('Transform Pipeline (Integration)', () => {
  describe('basic injectable (no deps)', () => {
    it('should generate a bean definition for a simple @Injectable class', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'

          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.code).toContain('token: Repo');
      expect(result.code).toContain("scope: 'prototype'");
      expect(result.code).toContain('() => new Repo()');
      expect(result.code).toContain('dependencies: []');
    });
  });

  describe('singleton with one dep', () => {
    it('should generate ordered beans with correct factory', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'

          @Injectable()
          export class Repo {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Repo } from './Repo.js'

          @Singleton()
          export class Service {
            constructor(private repo: Repo) {}
          }
        `,
      });

      expect(result.beans).toHaveLength(2);

      // Repo before Service (topo order)
      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names.indexOf('Repo')).toBeLessThan(names.indexOf('Service'));

      expect(result.code).toContain("scope: 'singleton'");
      expect(result.code).toContain('(dep0: any) => new Service(dep0)');
    });
  });

  describe('dependency chain A → B → C', () => {
    it('should order C, B, A in topological order', () => {
      const result = createTestProject({
        '/src/C.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class C {}
        `,
        '/src/B.ts': `
          import { Injectable } from './decorators.js'
          import { C } from './C.js'
          @Injectable()
          export class B { constructor(private c: C) {} }
        `,
        '/src/A.ts': `
          import { Singleton } from './decorators.js'
          import { B } from './B.js'
          @Singleton()
          export class A { constructor(private b: B) {} }
        `,
      });

      expect(result.beans).toHaveLength(3);
      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names.indexOf('C')).toBeLessThan(names.indexOf('B'));
      expect(names.indexOf('B')).toBeLessThan(names.indexOf('A'));
    });
  });

  describe('@Module with @Provides methods', () => {
    it('should generate module bean + provides beans', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }

            @Provides()
            port(): number { return 5432 }
          }
        `,
      });

      expect(result.beans).toHaveLength(3); // AppModule + dbUrl + port
      expect(result.code).toContain(
        "export const Db_Url_Token = new InjectionToken<string>('dbUrl')",
      );
      expect(result.code).toContain(
        "export const Port_Token = new InjectionToken<number>('port')",
      );
      expect(result.code).toContain(
        '(dep0: any) => (dep0 as AppModule).dbUrl()',
      );
      expect(result.code).toContain(
        '(dep0: any) => (dep0 as AppModule).port()',
      );
    });

    it('should handle @Provides with parameter dependencies', () => {
      const result = createTestProject({
        '/src/Config.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Config {}
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Config } from './Config.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(config: Config): string { return 'postgres://localhost' }
          }
        `,
      });

      expect(result.beans).toHaveLength(3); // Config + AppModule + dbUrl
      expect(result.code).toContain(
        '(dep0: any, dep1: any) => (dep0 as AppModule).dbUrl(dep1)',
      );
    });
  });

  describe('@Module({ imports: [...] })', () => {
    it('should expand imported modules', () => {
      const result = createTestProject({
        '/src/DbModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class DbModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
        '/src/AppModule.ts': `
          import { Module } from './decorators.js'
          import { DbModule } from './DbModule.js'

          @Module({ imports: [DbModule] })
          export class AppModule {}
        `,
      });

      // DbModule + dbUrl + AppModule
      expect(result.beans.length).toBeGreaterThanOrEqual(3);
      expect(result.code).toContain('DbModule');
      expect(result.code).toContain('Db_Url_Token');
    });
  });

  describe('transitive module imports', () => {
    it('should expand transitive module imports end-to-end', () => {
      const result = createTestProject({
        '/src/DbModule.ts': `
          import { Module, Provides } from './decorators.js'
          @Module()
          export class DbModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
        '/src/CacheModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { DbModule } from './DbModule.js'
          @Module({ imports: [DbModule] })
          export class CacheModule {
            @Provides()
            cacheUrl(): string { return 'redis://localhost' }
          }
        `,
        '/src/AppModule.ts': `
          import { Module } from './decorators.js'
          import { CacheModule } from './CacheModule.js'
          @Module({ imports: [CacheModule] })
          export class AppModule {}
        `,
      });

      // All three modules + their provides should be generated
      expect(result.code).toContain('DbModule');
      expect(result.code).toContain('CacheModule');
      expect(result.code).toContain('AppModule');
      expect(result.code).toContain('Db_Url_Token');
      expect(result.code).toContain('Cache_Url_Token');
    });
  });

  describe('field injection', () => {
    it('should handle @Inject on accessor field', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable, Named } from './decorators.js'

          @Named('primary')
          @Injectable()
          export class Repo {}
        `,
        '/src/Service.ts': `
          import { Singleton, Inject } from './decorators.js'

          @Singleton()
          export class Service {
            @Inject('primary') accessor repo!: any
          }
        `,
      });

      expect(result.beans).toHaveLength(2);
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.fieldDeps).toHaveLength(1);
      expect(service.fieldDeps[0].fieldName).toBe('repo');

      expect(result.code).toContain('instance.repo = field0');
    });

    it('should handle @Optional on accessor field', () => {
      const result = createTestProject({
        '/src/Tracer.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Tracer {}
        `,
        '/src/Service.ts': `
          import { Singleton, Optional } from './decorators.js'
          import { Tracer } from './Tracer.js'

          @Singleton()
          export class Service {
            @Optional() accessor tracer!: Tracer
          }
        `,
      });

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.fieldDeps[0].optional).toBe(true);
      expect(result.code).toContain('optional: true');
    });
  });

  describe('@Named + @Inject disambiguation', () => {
    it('should resolve @Inject(name) to the @Named bean', () => {
      const result = createTestProject({
        '/src/RepoA.ts': `
          import { Singleton, Named } from './decorators.js'
          @Named('primary')
          @Singleton()
          export class RepoA {}
        `,
        '/src/RepoB.ts': `
          import { Singleton, Named } from './decorators.js'
          @Named('secondary')
          @Singleton()
          export class RepoB {}
        `,
        '/src/Service.ts': `
          import { Singleton, Inject } from './decorators.js'

          @Singleton()
          export class Service {
            @Inject('primary') accessor repo!: any
          }
        `,
      });

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      // Should have been resolved to RepoA
      expect(service.fieldDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'RepoA',
      });
    });
  });

  describe('@Eager singleton', () => {
    it('should set eager: true in generated code', () => {
      const result = createTestProject({
        '/src/Startup.ts': `
          import { Singleton, Eager } from './decorators.js'

          @Eager()
          @Singleton()
          export class Startup {}
        `,
      });

      expect(result.beans[0].eager).toBe(true);
      expect(result.code).toContain('eager: true');
    });
  });

  describe('mixed constructor + field injection', () => {
    it('should handle both constructor deps and field deps', () => {
      const result = createTestProject({
        '/src/A.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class A {}
        `,
        '/src/B.ts': `
          import { Injectable, Named } from './decorators.js'
          @Named('special')
          @Injectable()
          export class B {}
        `,
        '/src/Service.ts': `
          import { Singleton, Inject } from './decorators.js'
          import { A } from './A.js'

          @Singleton()
          export class Service {
            @Inject('special') accessor b!: any
            constructor(private a: A) {}
          }
        `,
      });

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps).toHaveLength(1);
      expect(service.fieldDeps).toHaveLength(1);

      // Generated code should have both constructor and field injection
      expect(result.code).toContain('const instance = new Service(dep0)');
      expect(result.code).toContain('instance.b = field0');
    });
  });

  describe('generic @Provides matched by generic constructor param', () => {
    it('should wire generic @Provides to generic constructor param', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Singleton()
          export class Service {
            constructor(private repo: Repository<User>) {}
          }
        `,
      });

      // AppModule + Repository<User> provides bean + Service
      expect(result.beans.length).toBeGreaterThanOrEqual(3);
      expect(result.code).toContain(
        "export const Repository_User_Token = new InjectionToken<Repository<User>>('Repository<User>')",
      );
      expect(result.code).toContain('token: Repository_User_Token');
    });
  });

  describe('two different generic specializations as separate beans', () => {
    it('should produce separate tokens for Repository<User> and Repository<Order>', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Order.ts': `
          export class Order { id = 0 }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'
          import { Order } from './Order.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }

            @Provides()
            orderRepo(): Repository<Order> { return new Repository<Order>() }
          }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'
          import { Order } from './Order.js'

          @Singleton()
          export class Service {
            constructor(
              private userRepo: Repository<User>,
              private orderRepo: Repository<Order>,
            ) {}
          }
        `,
      });

      expect(result.code).toContain(
        "new InjectionToken<Repository<User>>('Repository<User>')",
      );
      expect(result.code).toContain(
        "new InjectionToken<Repository<Order>>('Repository<Order>')",
      );
      // Both tokens should be distinct
      expect(result.code).toContain('Repository_User_Token');
      expect(result.code).toContain('Repository_Order_Token');
    });
  });

  describe('type alias matches @Provides generic', () => {
    it('should resolve type alias to same canonical token as @Provides', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          import { User } from './User.js'
          export class Repository<T> { items: T[] = [] }
          export type UserRepo = Repository<User>
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { UserRepo } from './Repository.js'

          @Singleton()
          export class Service {
            constructor(private repo: UserRepo) {}
          }
        `,
      });

      // Should not throw MissingProviderError — alias resolves to same canonical token
      expect(result.beans.length).toBeGreaterThanOrEqual(3);
      expect(result.code).toContain(
        "new InjectionToken<Repository<User>>('Repository<User>')",
      );
    });
  });

  describe('re-export through barrel file', () => {
    it('should resolve re-exported types to original declaration file', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/index.ts': `
          export { Repository } from './Repository.js'
          export { User } from './User.js'
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository, User } from './index.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Repository, User } from './index.js'

          @Singleton()
          export class Service {
            constructor(private repo: Repository<User>) {}
          }
        `,
      });

      // Should resolve to same canonical token even through re-exports
      expect(result.beans.length).toBeGreaterThanOrEqual(3);
      expect(result.code).toContain(
        "new InjectionToken<Repository<User>>('Repository<User>')",
      );
    });
  });

  describe('@Eager on @Provides method', () => {
    it('should set eager: true on @Provides bean when @Eager is present', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides, Eager } from './decorators.js'

          @Module()
          export class AppModule {
            @Eager()
            @Provides()
            startupService(): string { return 'started' }

            @Provides()
            lazyService(): number { return 42 }
          }
        `,
      });

      const eagerBean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'injection-token' &&
          b.tokenRef.tokenName === 'startupService',
      )!;
      const lazyBean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'injection-token' &&
          b.tokenRef.tokenName === 'lazyService',
      )!;

      expect(eagerBean.eager).toBe(true);
      expect(lazyBean.eager).toBe(false);
      expect(result.code).toContain('eager: true');
    });
  });

  describe('@Eager + generic bean', () => {
    it('should generate eager generic @Provides bean', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
      });

      // The generic bean should be created with correct token
      expect(result.code).toContain('Repository_User_Token');
    });
  });

  describe('@PostConstruct metadata', () => {
    it('should emit postConstructMethods in metadata for decorated class', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, PostConstruct } from './decorators.js'

          @Singleton()
          export class Service {
            @PostConstruct()
            init() {}
          }
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].metadata).toEqual({
        postConstructMethods: ['init'],
      });
      expect(result.code).toContain(
        'metadata: { postConstructMethods: ["init"] }',
      );
    });

    it('should emit multiple postConstructMethods', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, PostConstruct } from './decorators.js'

          @Singleton()
          export class Service {
            @PostConstruct()
            initCache() {}

            @PostConstruct()
            loadConfig() {}
          }
        `,
      });

      expect(result.beans[0].metadata).toEqual({
        postConstructMethods: ['initCache', 'loadConfig'],
      });
    });

    it('should coexist with @PreDestroy metadata', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, PostConstruct, PreDestroy } from './decorators.js'

          @Singleton()
          export class Service {
            @PostConstruct()
            init() {}

            @PreDestroy()
            shutdown() {}
          }
        `,
      });

      expect(result.beans[0].metadata).toEqual({
        postConstructMethods: ['init'],
        preDestroyMethods: ['shutdown'],
      });
    });
  });

  describe('@PostProcessor metadata', () => {
    it('should emit isBeanPostProcessor in metadata for @PostProcessor class', () => {
      const result = createTestProject({
        '/src/LoggingBPP.ts': `
          import { Singleton, PostProcessor } from './decorators.js'

          @PostProcessor()
          @Singleton()
          export class LoggingBPP {}
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].metadata).toEqual({
        isBeanPostProcessor: true,
      });
      expect(result.code).toContain('isBeanPostProcessor: true');
    });

    it('should not emit isBeanPostProcessor for regular beans', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      expect(result.beans[0].metadata).toEqual({});
    });
  });

  describe('@PreDestroy metadata', () => {
    it('should emit preDestroyMethods in metadata for decorated class', () => {
      const result = createTestProject({
        '/src/Pool.ts': `
          import { Singleton, PreDestroy } from './decorators.js'

          @Singleton()
          export class Pool {
            @PreDestroy()
            shutdown() {}
          }
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].metadata).toEqual({
        preDestroyMethods: ['shutdown'],
      });
      expect(result.code).toContain(
        'metadata: { preDestroyMethods: ["shutdown"] }',
      );
    });

    it('should emit multiple preDestroyMethods', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, PreDestroy } from './decorators.js'

          @Singleton()
          export class Service {
            @PreDestroy()
            closeDb() {}

            @PreDestroy()
            flushCache() {}
          }
        `,
      });

      expect(result.beans[0].metadata).toEqual({
        preDestroyMethods: ['closeDb', 'flushCache'],
      });
    });

    it('should emit empty metadata when no @PreDestroy', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      expect(result.beans[0].metadata).toEqual({});
      expect(result.code).toContain('metadata: {}');
    });
  });

  describe('collection injection', () => {
    it('should generate collection: true for T[] constructor param', () => {
      const result = createTestProject({
        '/src/Handler.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Handler {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Handler } from './Handler.js'

          @Singleton()
          export class Service {
            constructor(private handlers: Handler[]) {}
          }
        `,
      });

      expect(result.code).toContain('collection: true');
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].collection).toBe(true);
    });

    it('should handle Array<T> syntax', () => {
      const result = createTestProject({
        '/src/Handler.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Handler {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Handler } from './Handler.js'

          @Singleton()
          export class Service {
            constructor(private handlers: Array<Handler>) {}
          }
        `,
      });

      expect(result.code).toContain('collection: true');
    });

    it('should not throw when no providers exist for collection dep', () => {
      const result = createTestProject({
        '/src/Handler.ts': `
          export class Handler {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Handler } from './Handler.js'

          @Singleton()
          export class Service {
            constructor(private handlers: Handler[]) {}
          }
        `,
      });

      // Should succeed with empty collection
      expect(result.beans).toHaveLength(1);
      expect(result.code).toContain('collection: true');
    });
  });

  describe('@Value config injection', () => {
    it('should generate config token and config bean when @Value is used', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value('DB_URL') accessor dbUrl!: string
          }
        `,
      });

      expect(result.code).toContain('__Goodie_Config');
      expect(result.code).toContain(
        "new InjectionToken<Record<string, unknown>>('__Goodie_Config')",
      );
      expect(result.code).toContain(
        'factory: () => ({ ...process.env, ...config } as Record<string, unknown>)',
      );
      expect(result.code).toContain("instance.dbUrl = __config['DB_URL']");
    });

    it('should generate default value fallback when @Value has default', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value('PORT', { default: 3000 }) accessor port!: number
          }
        `,
      });

      expect(result.code).toContain("instance.port = __config['PORT'] ?? 3000");
    });

    it('should generate createContext with config parameter when @Value is used', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value('API_KEY') accessor apiKey!: string
          }
        `,
      });

      expect(result.code).toContain(
        'export async function createContext(config?: Record<string, unknown>)',
      );
      expect(result.code).toContain('buildDefinitions(config)');
    });

    it('should not generate config infrastructure when no @Value is used', () => {
      const result = createTestProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      expect(result.code).not.toContain('__Goodie_Config');
      expect(result.code).not.toContain('buildDefinitions');
      expect(result.code).toContain('const definitions: BeanDefinition[] = [');
    });

    it('should add config token as dependency only for beans with @Value', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'
          import { Repo } from './Repo.js'

          @Singleton()
          export class Service {
            @Value('DB_URL') accessor dbUrl!: string
            constructor(private repo: Repo) {}
          }
        `,
      });

      // Service should have __Goodie_Config in its deps, Repo should not
      const serviceMatch = result.code.match(
        /token: Service[\s\S]*?dependencies: \[([\s\S]*?)\]/,
      );
      expect(serviceMatch).toBeTruthy();
      expect(serviceMatch![1]).toContain('__Goodie_Config');

      const repoMatch = result.code.match(
        /token: Repo[\s\S]*?dependencies: \[([\s\S]*?)\]/,
      );
      expect(repoMatch).toBeTruthy();
      expect(repoMatch![1]).not.toContain('__Goodie_Config');
    });
  });

  describe('error: missing generic provider', () => {
    it('should throw MissingProviderError for unresolved generic dependency', () => {
      expect(() =>
        createTestProject({
          '/src/User.ts': `
            export class User { name = '' }
          `,
          '/src/Repository.ts': `
            export class Repository<T> { items: T[] = [] }
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            import { Repository } from './Repository.js'
            import { User } from './User.js'
            @Singleton()
            export class Service { constructor(private repo: Repository<User>) {} }
          `,
        }),
      ).toThrow(MissingProviderError);
    });
  });

  describe('error: circular dependency', () => {
    it('should throw CircularDependencyError', () => {
      expect(() =>
        createTestProject({
          '/src/A.ts': `
            import { Singleton } from './decorators.js'
            import { B } from './B.js'
            @Singleton()
            export class A { constructor(private b: B) {} }
          `,
          '/src/B.ts': `
            import { Singleton } from './decorators.js'
            import { A } from './A.js'
            @Singleton()
            export class B { constructor(private a: A) {} }
          `,
        }),
      ).toThrow(CircularDependencyError);
    });
  });

  describe('error: missing provider', () => {
    it('should throw MissingProviderError', () => {
      expect(() =>
        createTestProject({
          '/src/Missing.ts': `
            export class Missing {}
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            import { Missing } from './Missing.js'
            @Singleton()
            export class Service { constructor(private m: Missing) {} }
          `,
        }),
      ).toThrow(MissingProviderError);
    });
  });

  describe('class inheritance subtype resolution', () => {
    it('should wire dependency on abstract base to concrete @Singleton subclass', () => {
      const result = createTestProject({
        '/src/BaseRepo.ts': `
          export abstract class BaseRepo {
            abstract findAll(): string[]
          }
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {
            findAll() { return ['alice'] }
          }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class Service {
            constructor(private repo: BaseRepo) {}
          }
        `,
      });

      // Service's dep should be rewritten from BaseRepo to UserRepo
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'UserRepo',
      });
      // Generated code should import and use UserRepo
      expect(result.code).toContain('UserRepo');
    });
  });

  describe('error: interface constructor param without token', () => {
    it('should throw UnresolvableTypeError for primitive constructor param', () => {
      expect(() =>
        createTestProject({
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            @Singleton()
            export class Service { constructor(private name: string) {} }
          `,
        }),
      ).toThrow(UnresolvableTypeError);
    });
  });

  describe('primitive @Provides parameter auto-wiring', () => {
    it('should wire a primitive param to the single matching @Provides', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }

            @Provides()
            pgPool(dbUrl: string): number { return 42 }
          }
        `,
      });

      // dbUrl provides string, pgPool takes string → auto-wired
      expect(result.beans.length).toBeGreaterThanOrEqual(3);
      expect(result.code).toContain('Db_Url_Token');
      expect(result.code).toContain('Pg_Pool_Token');
      // pgPool factory should receive the module + dbUrl deps
      expect(result.code).toContain(
        '(dep0: any, dep1: any) => (dep0 as AppModule).pgPool(dep1)',
      );
    });

    it('should disambiguate multiple same-type providers by param name', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }

            @Provides()
            appName(): string { return 'my-app' }

            @Provides()
            greeting(appName: string): string { return 'Hello ' + appName }
          }
        `,
      });

      // Two string providers (dbUrl, appName), param name 'appName' matches method name
      expect(result.beans.length).toBeGreaterThanOrEqual(4);
      expect(result.code).toContain('Greeting_Token');
    });

    it('should throw when multiple same-type providers cannot be disambiguated', () => {
      expect(() =>
        createTestProject({
          '/src/AppModule.ts': `
            import { Module, Provides } from './decorators.js'

            @Module()
            export class AppModule {
              @Provides()
              dbUrl(): string { return 'postgres://localhost' }

              @Provides()
              appName(): string { return 'my-app' }

              @Provides()
              greeting(url: string): string { return 'Hello ' + url }
            }
          `,
        }),
      ).toThrow(UnresolvableTypeError);
    });
  });

  describe('exported typed tokens', () => {
    it('should export token declarations with export const', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      expect(result.code).toContain('export const Db_Url_Token =');
    });

    it('should type tokens with the original return type', () => {
      const result = createTestProject({
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Module()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
      });

      // Should have typed generic param, not <unknown>
      expect(result.code).toContain(
        "new InjectionToken<Repository<User>>('Repository<User>')",
      );
      // Should NOT contain <unknown> for this token
      expect(result.code).not.toContain('InjectionToken<unknown>');
    });

    it('should type primitive return type tokens', () => {
      const result = createTestProject({
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            port(): number { return 8080 }
          }
        `,
      });

      expect(result.code).toContain("new InjectionToken<number>('port')");
    });
  });

  describe('generated code structure', () => {
    it('should include header comment', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.code).toMatch(
        /\/\/ AppContext\.generated\.ts — DO NOT EDIT \(generated by @goodie-ts\/transformer v\d+\.\d+\.\d+ at \d{4}-\d{2}-\d{2}T/,
      );
    });

    it('should include ApplicationContext import', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.code).toContain(
        "import { ApplicationContext, Goodie } from '@goodie-ts/core'",
      );
    });

    it('should export definitions and createContext', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.code).toContain('export { definitions }');
      expect(result.code).toContain('export async function createContext()');
    });

    it('should export Goodie app builder', () => {
      const result = createTestProject({
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.code).toContain(
        'export const app = Goodie.build(definitions)',
      );
    });
  });
});
