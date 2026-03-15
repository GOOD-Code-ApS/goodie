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
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Transient } from './decorators.js'

          @Transient()
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

      const service = result.components.find(
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
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/A.ts': `
          import { Transient } from './decorators.js'
          @Transient()
          export class A {}
        `,
        '/src/B.ts': `
          import { Transient } from './decorators.js'
          @Transient()
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

      const c = result.components.find(
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

      const service = result.components[0];
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

      const service = result.components.find(
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
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Client.ts': `
          import { Transient } from './decorators.js'
          @Transient()
          export class Client {}
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'
          import { Client } from './Client.js'

          @Factory()
          export class AppModule {
            @Provides()
            client(): Client { return new Client() }
          }
        `,
      });

      // @Provides is expanded into a separate bean with factoryKind: 'provides'
      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(1);
      expect(providesBeans[0].tokenRef).toEqual({
        kind: 'class',
        className: 'Client',
        importPath: '/src/Client.ts',
      });
    });

    it('should resolve @Provides with primitive return type to method-name InjectionToken', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'

          @Factory()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(1);
      expect(providesBeans[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'dbUrl',
        importPath: undefined,
        typeAnnotation: 'string',
      });
    });

    it('should preserve @Eager flag on @Provides method', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Eager() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides, Eager } from './decorators.js'

          @Factory()
          export class AppModule {
            @Eager()
            @Provides()
            startupService(): string { return 'started' }

            @Provides()
            lazyService(): string { return 'lazy' }
          }
        `,
      });

      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(2);
      const eager = providesBeans.find(
        (b) => b.providesSource?.methodName === 'startupService',
      )!;
      const lazy = providesBeans.find(
        (b) => b.providesSource?.methodName === 'lazyService',
      )!;
      expect(eager.eager).toBe(true);
      expect(lazy.eager).toBe(false);
    });

    it('should default @Provides scope to singleton', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'

          @Factory()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans[0].scope).toBe('singleton');
    });

    it('should resolve @Provides method parameter dependencies', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Config.ts': `
          import { Transient } from './decorators.js'
          @Transient()
          export class Config {}
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'
          import { Config } from './Config.js'

          @Factory()
          export class AppModule {
            @Provides()
            dbUrl(config: Config): string { return 'postgres://localhost' }
          }
        `,
      });

      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(1);
      // First dep is the owner module, second is the method param
      expect(providesBeans[0].constructorDeps).toHaveLength(2);
      expect(providesBeans[0].constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'AppModule',
      });
      expect(providesBeans[0].constructorDeps[1].tokenRef).toMatchObject({
        kind: 'class',
        className: 'Config',
      });
    });
  });

  describe('@Provides on non-@Factory beans', () => {
    it('should expand @Provides on a @Singleton without setting isFactory', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppConfig.ts': `
          import { Singleton, Provides } from './decorators.js'

          @Singleton()
          export class AppConfig {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      // The @Singleton bean itself should NOT have isFactory metadata
      const configBean = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'AppConfig' &&
          b.factoryKind === 'constructor',
      )!;
      expect(configBean.metadata.isFactory).toBeUndefined();

      // The @Provides method should still expand into a separate bean
      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(1);
      expect(providesBeans[0].tokenRef).toEqual({
        kind: 'injection-token',
        tokenName: 'dbUrl',
        importPath: undefined,
        typeAnnotation: 'string',
      });
      expect(providesBeans[0].constructorDeps[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'AppConfig',
      });
    });
  });

  describe('module bean resolution', () => {
    it('should register @Factory class as a bean with isFactory metadata', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'

          @Factory()
          export class AppModule {
            @Provides()
            dbUrl(): string { return 'postgres://localhost' }
          }
        `,
      });

      const moduleBeans = result.components.filter(
        (b) => b.factoryKind === 'constructor' && b.metadata.isFactory,
      );
      expect(moduleBeans).toHaveLength(1);
      expect(moduleBeans[0].tokenRef).toMatchObject({
        kind: 'class',
        className: 'AppModule',
      });
    });
  });

  describe('@PostProcessor metadata', () => {
    it('should set isComponentPostProcessor in metadata when @PostProcessor is present', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function PostProcessor() { return (t: any, c: any) => {} }
        `,
        '/src/LoggingBPP.ts': `
          import { Singleton, PostProcessor } from './decorators.js'

          @PostProcessor()
          @Singleton()
          export class LoggingBPP {}
        `,
      });

      const bpp = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'LoggingBPP',
      )!;
      expect(bpp.metadata.isComponentPostProcessor).toBe(true);
    });

    it('should not set isComponentPostProcessor for regular beans', () => {
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

      expect(
        result.components[0].metadata.isComponentPostProcessor,
      ).toBeUndefined();
    });
  });

  describe('generic type resolution', () => {
    it('should resolve generic constructor param to InjectionTokenRef with canonical key', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          import { Transient } from './decorators.js'
          @Transient()
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

      const service = result.components.find(
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

      const service = result.components.find(
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
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'
          import { Repository } from './Repository.js'
          import { User } from './User.js'

          @Factory()
          export class AppModule {
            @Provides()
            userRepo(): Repository<User> { return new Repository<User>() }
          }
        `,
      });

      const providesBeans = result.components.filter(
        (b) => b.factoryKind === 'provides',
      );
      expect(providesBeans).toHaveLength(1);
      expect(providesBeans[0].tokenRef).toEqual({
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
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Transient } from './decorators.js'
          @Transient()
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

      const service = result.components.find(
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

      const service = result.components.find(
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
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Handler.ts': `
          import { Transient } from './decorators.js'
          @Transient()
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

      const service = result.components.find(
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
    it('should preserve scope from @Transient (prototype)', () => {
      const result = scanAndResolve({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Transient } from './decorators.js'
          @Transient()
          export class Repo {}
        `,
      });

      expect(result.components[0].scope).toBe('transient');
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

      expect(result.components[0].scope).toBe('singleton');
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

      expect(result.components[0].name).toBe('primary');
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

      expect(result.components[0].eager).toBe(true);
    });
  });
});
