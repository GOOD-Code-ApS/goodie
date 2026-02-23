import { scan } from '@goodie/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph-builder.js';
import { resolve } from '../src/resolver.js';
import {
  AmbiguousProviderError,
  CircularDependencyError,
  MissingProviderError,
} from '../src/transformer-errors.js';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function pipeline(files: Record<string, string>) {
  const project = createProject(files);
  const scanResult = scan(project);
  const resolveResult = resolve(scanResult);
  return buildGraph(resolveResult);
}

const decoratorsFile = `
  export function Injectable() { return (t: any, c: any) => {} }
  export function Singleton() { return (t: any, c: any) => {} }
  export function Named(n: string) { return (t: any, c: any) => {} }
  export function Eager() { return (t: any, c: any) => {} }
  export function Module(opts?: any) { return (t: any, c: any) => {} }
  export function Provides() { return (t: any, c: any) => {} }
  export function Inject(q: any) { return (t: any, c: any) => {} }
  export function Optional() { return (t: any, c: any) => {} }
`;

describe('Graph Builder', () => {
  describe('topological ordering', () => {
    it('should return a single bean with no deps', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].tokenRef).toMatchObject({ className: 'Repo' });
    });

    it('should order dependency before dependent', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
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
      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names.indexOf('Repo')).toBeLessThan(names.indexOf('Service'));
    });

    it('should handle a dependency chain A → B → C', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
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

      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names.indexOf('C')).toBeLessThan(names.indexOf('B'));
      expect(names.indexOf('B')).toBeLessThan(names.indexOf('A'));
    });
  });

  describe('module expansion', () => {
    it('should register module class as implicit singleton', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/AppModule.ts': `
          import { Module } from './decorators.js'
          @Module()
          export class AppModule {}
        `,
      });

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].tokenRef).toMatchObject({
        className: 'AppModule',
      });
      expect(result.beans[0].scope).toBe('singleton');
      expect(result.beans[0].metadata.isModule).toBe(true);
    });

    it('should register @Provides methods as beans with module as first dep', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      expect(result.beans).toHaveLength(2);
      const dbUrlBean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'injection-token' &&
          b.tokenRef.tokenName === 'dbUrl',
      )!;
      expect(dbUrlBean).toBeDefined();
      expect(dbUrlBean.scope).toBe('singleton');
      expect(dbUrlBean.factoryKind).toBe('provides');
      expect(dbUrlBean.constructorDeps[0].tokenRef).toMatchObject({
        className: 'AppModule',
      });
    });

    it('should order module before its @Provides beans', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names.indexOf('AppModule')).toBeLessThan(names.indexOf('dbUrl'));
    });

    it('should resolve @Provides method parameter dependencies', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
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

      const dbUrlBean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'injection-token' &&
          b.tokenRef.tokenName === 'dbUrl',
      )!;
      // First dep is module, second is the Config param
      expect(dbUrlBean.constructorDeps).toHaveLength(2);
      expect(dbUrlBean.constructorDeps[0].tokenRef).toMatchObject({
        className: 'AppModule',
      });
      expect(dbUrlBean.constructorDeps[1].tokenRef).toMatchObject({
        className: 'Config',
      });
    });
  });

  describe('@Named + @Inject resolution', () => {
    it('should resolve @Inject(name) to @Named bean', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/Repo.ts': `
          import { Singleton, Named } from './decorators.js'

          @Named('primary')
          @Singleton()
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.fieldDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'Repo',
      });
    });
  });

  describe('error cases', () => {
    it('should throw CircularDependencyError for A → B → A', () => {
      expect(() =>
        pipeline({
          '/src/decorators.ts': decoratorsFile,
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

    it('should throw MissingProviderError for unregistered required dep', () => {
      expect(() =>
        pipeline({
          '/src/decorators.ts': decoratorsFile,
          '/src/Missing.ts': `
            export class Missing {}
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            import { Missing } from './Missing.js'

            @Singleton()
            export class Service {
              constructor(private missing: Missing) {}
            }
          `,
        }),
      ).toThrow(MissingProviderError);
    });
  });

  describe('eager beans', () => {
    it('should preserve @Eager flag through the graph', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/Service.ts': `
          import { Singleton, Eager } from './decorators.js'

          @Eager()
          @Singleton()
          export class Service {}
        `,
      });

      expect(result.beans[0].eager).toBe(true);
    });
  });

  describe('class inheritance / subtype resolution', () => {
    it('resolves dependency on base class via decorated subclass', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/BaseRepo.ts': `
          export abstract class BaseRepo {}
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {}
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

      // Service's dependency on BaseRepo should be rewritten to UserRepo
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'UserRepo',
      });
    });

    it('throws AmbiguousProviderError when multiple subtypes exist for unregistered base', () => {
      expect(() =>
        pipeline({
          '/src/decorators.ts': decoratorsFile,
          '/src/BaseRepo.ts': `
            export abstract class BaseRepo {}
          `,
          '/src/UserRepo.ts': `
            import { Singleton } from './decorators.js'
            import { BaseRepo } from './BaseRepo.js'

            @Singleton()
            export class UserRepo extends BaseRepo {}
          `,
          '/src/OrderRepo.ts': `
            import { Singleton } from './decorators.js'
            import { BaseRepo } from './BaseRepo.js'

            @Singleton()
            export class OrderRepo extends BaseRepo {}
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            import { BaseRepo } from './BaseRepo.js'

            @Singleton()
            export class Service {
              constructor(private repo: BaseRepo) {}
            }
          `,
        }),
      ).toThrow(AmbiguousProviderError);
    });

    it('resolves directly when base is registered, even with subtypes', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/BaseRepo.ts': `
          import { Injectable } from './decorators.js'

          @Injectable()
          export class BaseRepo {}
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {}
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

      // BaseRepo is directly registered, so Service gets BaseRepo (not UserRepo)
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'BaseRepo',
      });
    });

    it('resolves 3-level inheritance chain: C extends B extends A', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/A.ts': `
          export abstract class A {}
        `,
        '/src/B.ts': `
          import { A } from './A.js'
          export abstract class B extends A {}
        `,
        '/src/C.ts': `
          import { Singleton } from './decorators.js'
          import { B } from './B.js'

          @Singleton()
          export class C extends B {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { A } from './A.js'

          @Singleton()
          export class Service {
            constructor(private dep: A) {}
          }
        `,
      });

      // Service depends on A, only C is registered (via B extends A chain)
      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'C',
      });
    });

    it('throws AmbiguousProviderError for multi-level chain with multiple leaves', () => {
      expect(() =>
        pipeline({
          '/src/decorators.ts': decoratorsFile,
          '/src/A.ts': `
            export abstract class A {}
          `,
          '/src/B.ts': `
            import { A } from './A.js'
            export abstract class B extends A {}
          `,
          '/src/C.ts': `
            import { Singleton } from './decorators.js'
            import { B } from './B.js'

            @Singleton()
            export class C extends B {}
          `,
          '/src/D.ts': `
            import { Singleton } from './decorators.js'
            import { B } from './B.js'

            @Singleton()
            export class D extends B {}
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'
            import { A } from './A.js'

            @Singleton()
            export class Service {
              constructor(private dep: A) {}
            }
          `,
        }),
      ).toThrow(AmbiguousProviderError);
    });

    it('does not interfere when both are decorated but base is not depended on', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/BaseRepo.ts': `
          import { Injectable } from './decorators.js'

          @Injectable()
          export class BaseRepo {}
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {}
        `,
      });

      // Both should be registered as separate beans
      const names = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(names).toContain('BaseRepo');
      expect(names).toContain('UserRepo');
    });

    it('resolves via subclass when base class is not decorated', () => {
      const result = pipeline({
        '/src/decorators.ts': decoratorsFile,
        '/src/BaseRepo.ts': `
          export class BaseRepo {}
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {}
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'UserRepo',
      });
    });
  });
});
