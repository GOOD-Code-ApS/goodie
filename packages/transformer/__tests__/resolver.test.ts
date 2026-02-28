import { scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolver.js';
import { UnresolvableTypeError } from '../src/transformer-errors.js';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function scanAndResolve(files: Record<string, string>) {
  const project = createProject(files);
  const scanResult = scan(project);
  return resolve(scanResult);
}

describe('Resolver', () => {
  describe('constructor parameter resolution', () => {
    it('should resolve class-typed constructor params to ClassTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps).toHaveLength(1);
      expect(service.constructorDeps[0].tokenRef).toEqual({
        kind: 'class',
        className: 'Repo',
        importPath: '/src/Repo.ts',
      });
      expect(service.constructorDeps[0].optional).toBe(false);
    });

    it('should throw UnresolvableTypeError for primitive constructor params', () => {
      expect(() =>
        scanAndResolve({
          '/src/decorators.ts': `
            export function Singleton() { return (t: any, c: any) => {} }
          `,
          '/src/Service.ts': `
            import { Singleton } from './decorators.js'

            @Singleton()
            export class Service {
              constructor(private name: string) {}
            }
          `,
        }),
      ).toThrow(UnresolvableTypeError);
    });

    it('should preserve multiple constructor deps in order', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
        '/src/A.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class A {}
        `,
        '/src/B.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class B {}
        `,
        '/src/C.ts': `
          import { Singleton } from './decorators.js'
          import { A } from './A.js'
          import { B } from './B.js'

          @Singleton()
          export class C {
            constructor(private a: A, private b: B) {}
          }
        `,
      });

      const c = result.beans.find(
        (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'C',
      )!;
      expect(c.constructorDeps).toHaveLength(2);
      expect(c.constructorDeps[0].tokenRef).toMatchObject({ className: 'A' });
      expect(c.constructorDeps[1].tokenRef).toMatchObject({ className: 'B' });
    });
  });

  describe('field injection resolution', () => {
    it('should resolve @Inject with string qualifier to InjectionTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Inject(q: any) { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, Inject } from './decorators.js'

          @Singleton()
          export class Service {
            @Inject('primary') accessor repo!: any
          }
        `,
      });

      const service = result.beans[0];
      expect(service.fieldDeps).toHaveLength(1);
      expect(service.fieldDeps[0].fieldName).toBe('repo');
      expect(service.fieldDeps[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'primary',
        importPath: undefined,
      });
    });

    it('should resolve @Optional fields', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Optional() { return (t: any, c: any) => {} }
        `,
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
      expect(service.fieldDeps).toHaveLength(1);
      expect(service.fieldDeps[0].optional).toBe(true);
      expect(service.fieldDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'Tracer',
      });
    });
  });

  describe('@Provides resolution', () => {
    it('should resolve @Provides with class return type to ClassTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
        '/src/Client.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Client {}
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'
          import { Client } from './Client.js'

          @Module()
          export class AppModule {
            @Provides()
            client(): Client { return new Client() }
          }
        `,
      });

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].provides).toHaveLength(1);
      expect(result.modules[0].provides[0].tokenRef).toEqual({
        kind: 'class',
        className: 'Client',
        importPath: '/src/Client.ts',
      });
    });

    it('should resolve @Provides with primitive return type to method-name InjectionToken', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      expect(result.modules[0].provides[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'dbUrl',
        importPath: undefined,
        typeAnnotation: 'string',
      });
    });

    it('should default @Provides scope to singleton', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Module, Provides } from './decorators.js'

          @Module()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      expect(result.modules[0].provides[0].scope).toBe('singleton');
    });

    it('should resolve @Provides method parameter dependencies', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
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

      const provides = result.modules[0].provides[0];
      expect(provides.dependencies).toHaveLength(1);
      expect(provides.dependencies[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'Config',
      });
    });
  });

  describe('module resolution', () => {
    it('should warn when module import cannot be resolved', () => {
      const loc = { filePath: '/src/AppModule.ts', line: 1, column: 1 };
      const result = resolve({
        beans: [],
        modules: [
          {
            classDeclaration: undefined as any,
            classTokenRef: {
              kind: 'class' as const,
              className: 'AppModule',
              importPath: '/src/AppModule.ts',
            },
            imports: [{ className: 'MissingModule', sourceFile: undefined }],
            provides: [],
            sourceLocation: loc,
          },
        ],
        warnings: [],
      });

      const appModule = result.modules.find(
        (m) => m.classTokenRef.className === 'AppModule',
      )!;
      // Unresolvable imports are skipped with a warning
      expect(appModule.imports).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('MissingModule'))).toBe(
        true,
      );
    });

    it('should resolve module imports to ClassTokenRefs', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/DbModule.ts': `
          import { Module } from './decorators.js'
          @Module()
          export class DbModule {}
        `,
        '/src/AppModule.ts': `
          import { Module } from './decorators.js'
          import { DbModule } from './DbModule.js'

          @Module({ imports: [DbModule] })
          export class AppModule {}
        `,
      });

      const appModule = result.modules.find(
        (m) => m.classTokenRef.className === 'AppModule',
      )!;
      expect(appModule.imports).toHaveLength(1);
      expect(appModule.imports[0]).toMatchObject({
        kind: 'class',
        className: 'DbModule',
      });
    });
  });

  describe('generic type resolution', () => {
    it('should resolve generic constructor param to InjectionTokenRef with canonical key', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repository<T> { items: T[] = [] }
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps).toHaveLength(1);
      expect(service.constructorDeps[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'Repository<User>',
        importPath: '/src/Repository.ts',
        typeAnnotation: 'Repository<User>',
        typeImports: new Map([
          ['Repository', '/src/Repository.ts'],
          ['User', '/src/User.ts'],
        ]),
      });
    });

    it('should resolve type alias to same canonical InjectionTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          import { User } from './User.js'
          export class Repository<T> { items: T[] = [] }
          export type UserRepo = Repository<User>
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      // Type alias should resolve to the same canonical key
      expect(service.constructorDeps[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'Repository<User>',
        importPath: '/src/Repository.ts',
        typeAnnotation: 'Repository<User>',
        typeImports: new Map([
          ['Repository', '/src/Repository.ts'],
          ['User', '/src/User.ts'],
        ]),
      });
    });

    it('should resolve @Provides with generic return type to canonical InjectionTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Module(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
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

      expect(result.modules[0].provides[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'Repository<User>',
        importPath: '/src/Repository.ts',
        typeAnnotation: 'Repository<User>',
        typeImports: new Map([
          ['Repository', '/src/Repository.ts'],
          ['User', '/src/User.ts'],
        ]),
      });
    });

    it('should keep non-generic types as ClassTokenRef', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toEqual({
        kind: 'class',
        className: 'Repo',
        importPath: '/src/Repo.ts',
      });
    });

    it('should produce different tokens for different specializations', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Order.ts': `
          export class Order { id = 0 }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'Repository<User>',
        importPath: '/src/Repository.ts',
        typeAnnotation: 'Repository<User>',
        typeImports: new Map([
          ['Repository', '/src/Repository.ts'],
          ['User', '/src/User.ts'],
        ]),
      });
      expect(service.constructorDeps[1].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'Repository<Order>',
        importPath: '/src/Repository.ts',
        typeAnnotation: 'Repository<Order>',
        typeImports: new Map([
          ['Repository', '/src/Repository.ts'],
          ['Order', '/src/Order.ts'],
        ]),
      });
    });
  });

  describe('collection parameter resolution', () => {
    it('should produce collection: true for Service[] parameter', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
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

      const service = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      )!;
      expect(service.constructorDeps).toHaveLength(1);
      expect(service.constructorDeps[0].collection).toBe(true);
      expect(service.constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'Handler',
      });
    });
  });

  describe('bean metadata', () => {
    it('should preserve scope from @Injectable (prototype)', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Injectable() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Repo {}
        `,
      });

      expect(result.beans[0].scope).toBe('prototype');
    });

    it('should preserve scope from @Singleton', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Service {}
        `,
      });

      expect(result.beans[0].scope).toBe('singleton');
    });

    it('should preserve @Named qualifier', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Named(n: string) { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Singleton, Named } from './decorators.js'
          @Named('primary')
          @Singleton()
          export class Repo {}
        `,
      });

      expect(result.beans[0].name).toBe('primary');
    });

    it('should preserve @Eager flag', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Eager() { return (t: any, c: any) => {} }
        `,
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
});
