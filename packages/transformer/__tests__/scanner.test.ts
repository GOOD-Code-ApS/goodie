import { scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { InvalidDecoratorUsageError } from '../src/transformer-errors.js';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('Scanner', () => {
  describe('@Transient / @Singleton classes', () => {
    it('should discover a basic @Transient class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/UserRepo.ts': `
          import { Transient } from './decorators.js'

          @Transient()
          export class UserRepo {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].classTokenRef.className).toBe('UserRepo');
      expect(result.components[0].scope).toBe('transient');
      expect(result.components[0].eager).toBe(false);
    });

    it('should discover a @Singleton class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/UserService.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class UserService {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].scope).toBe('singleton');
    });

    it('should detect @Named qualifier', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Named(n: string) { return (t: any, c: any) => {} }
        `,
        '/src/PrimaryRepo.ts': `
          import { Singleton, Named } from './decorators.js'

          @Named('primary')
          @Singleton()
          export class PrimaryRepo {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].name).toBe('primary');
    });

    it('should detect @Primary flag', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Primary(t: any, c: any) {}
        `,
        '/src/DefaultRepo.ts': `
          import { Singleton, Primary } from './decorators.js'

          @Primary
          @Singleton()
          export class DefaultRepo {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].primary).toBe(true);
    });

    it('should default primary to false', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Repo {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].primary).toBe(false);
    });

    it('should detect @Eager flag', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Eager() { return (t: any, c: any) => {} }
        `,
        '/src/StartupService.ts': `
          import { Singleton, Eager } from './decorators.js'

          @Eager()
          @Singleton()
          export class StartupService {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].eager).toBe(true);
    });

    it('should scan constructor parameters', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams).toHaveLength(1);
      expect(service.constructorParams[0].paramName).toBe('repo');
      expect(service.constructorParams[0].typeName).toBe('Repo');
    });
  });

  describe('field injections', () => {
    it('should scan @Inject on accessor fields with string qualifier', () => {
      const project = createProject({
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

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].fieldInjections).toHaveLength(1);
      expect(result.components[0].fieldInjections[0].fieldName).toBe('repo');
      expect(result.components[0].fieldInjections[0].qualifier).toBe('primary');
      expect(result.components[0].fieldInjections[0].optional).toBe(false);
    });

    it('should scan @Optional on accessor fields', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Optional() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, Optional } from './decorators.js'

          @Singleton()
          export class Service {
            @Optional() accessor tracer!: any
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].fieldInjections).toHaveLength(1);
      expect(result.components[0].fieldInjections[0].fieldName).toBe('tracer');
      expect(result.components[0].fieldInjections[0].optional).toBe(true);
    });
  });

  describe('@Factory classes', () => {
    it('should discover a @Factory class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/AppModule.ts': `
          import { Factory } from './decorators.js'

          @Factory()
          export class AppModule {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].classTokenRef.className).toBe('AppModule');
      expect(result.components[0].scope).toBe('singleton');
    });

    it('should scan @Provides methods', () => {
      const project = createProject({
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

            @Provides()
            port(): number { return 5432 }
          }
        `,
      });

      const result = scan(project);

      const appModule = result.components.find(
        (b) => b.classTokenRef.className === 'AppModule',
      )!;
      expect(appModule.provides).toHaveLength(2);
      expect(appModule.provides[0].methodName).toBe('dbUrl');
      expect(appModule.provides[0].returnTypeName).toBe('string');
      expect(appModule.provides[1].methodName).toBe('port');
      expect(appModule.provides[1].returnTypeName).toBe('number');
    });

    it('should scan @Provides method parameters', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
          export function Provides() { return (t: any, c: any) => {} }
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Transient } from './decorators.js'

          @Transient()
          export class Repo {}
        `,
        '/src/AppModule.ts': `
          import { Factory, Provides } from './decorators.js'
          import { Repo } from './Repo.js'

          @Factory()
          export class AppModule {
            @Provides()
            service(repo: Repo): string { return 'ok' }
          }
        `,
      });

      const result = scan(project);

      const appModule = result.components.find(
        (b) => b.classTokenRef.className === 'AppModule',
      )!;
      expect(appModule.provides[0].params).toHaveLength(1);
      expect(appModule.provides[0].params[0].paramName).toBe('repo');
      expect(appModule.provides[0].params[0].typeName).toBe('Repo');
    });

    it('should detect @Eager on @Provides methods', () => {
      const project = createProject({
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

      const result = scan(project);

      const appModule = result.components.find(
        (b) => b.classTokenRef.className === 'AppModule',
      )!;
      expect(appModule.provides).toHaveLength(2);
      expect(appModule.provides[0].methodName).toBe('startupService');
      expect(appModule.provides[0].eager).toBe(true);
      expect(appModule.provides[1].methodName).toBe('lazyService');
      expect(appModule.provides[1].eager).toBe(false);
    });

    it('should scan @Provides on a @Singleton bean (not just @Factory)', () => {
      const project = createProject({
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

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].classTokenRef.className).toBe('AppConfig');
      expect(result.components[0].scope).toBe('singleton');
      expect(result.components[0].isFactory).toBe(false);
      expect(result.components[0].provides).toHaveLength(1);
      expect(result.components[0].provides[0].methodName).toBe('dbUrl');
    });

    it('should scan @Factory as a singleton bean', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/DbModule.ts': `
          import { Factory } from './decorators.js'

          @Factory()
          export class DbModule {}
        `,
        '/src/AppModule.ts': `
          import { Factory } from './decorators.js'

          @Factory()
          export class AppModule {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(2);
      expect(result.components.every((b) => b.scope === 'singleton')).toBe(
        true,
      );
    });
  });

  describe('generic type extraction', () => {
    it('should extract type arguments for generic constructor params', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams).toHaveLength(1);
      const param = service.constructorParams[0];
      expect(param.typeName).toBe('Repository<User>');
      expect(param.resolvedBaseTypeName).toBe('Repository');
      expect(param.typeArguments).toHaveLength(1);
      expect(param.typeArguments[0].typeName).toBe('User');
    });

    it('should extract nested generic type arguments', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/User.ts': `
          export class User { name = '' }
        `,
        '/src/Repository.ts': `
          export class Repository<T> { items: T[] = [] }
        `,
        '/src/Wrapper.ts': `
          export class Wrapper<K, V> { key!: K; value!: V }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          import { Repository } from './Repository.js'
          import { Wrapper } from './Wrapper.js'
          import { User } from './User.js'

          @Singleton()
          export class Service {
            constructor(private data: Wrapper<User, Repository<User>>) {}
          }
        `,
      });

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      const param = service.constructorParams[0];
      expect(param.resolvedBaseTypeName).toBe('Wrapper');
      expect(param.typeArguments).toHaveLength(2);
      expect(param.typeArguments[0].typeName).toBe('User');
      expect(param.typeArguments[1].typeName).toBe('Repository');
      expect(param.typeArguments[1].typeArguments).toHaveLength(1);
      expect(param.typeArguments[1].typeArguments[0].typeName).toBe('User');
    });

    it('should resolve type alias to base type name', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      const param = service.constructorParams[0];
      expect(param.resolvedBaseTypeName).toBe('Repository');
      expect(param.typeArguments).toHaveLength(1);
      expect(param.typeArguments[0].typeName).toBe('User');
    });

    it('should have empty typeArguments for non-generic params', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams[0].typeArguments).toEqual([]);
      expect(service.constructorParams[0].resolvedBaseTypeName).toBe('Repo');
    });

    it('should extract generic type arguments for @Provides return type', () => {
      const project = createProject({
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

      const result = scan(project);
      const appModule = result.components.find(
        (b) => b.classTokenRef.className === 'AppModule',
      )!;
      const provides = appModule.provides[0];

      expect(provides.returnTypeName).toBe('Repository<User>');
      expect(provides.returnResolvedBaseTypeName).toBe('Repository');
      expect(provides.returnTypeArguments).toHaveLength(1);
      expect(provides.returnTypeArguments[0].typeName).toBe('User');
    });
  });

  describe('@OnDestroy methods', () => {
    it('should discover @OnDestroy method on a bean', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function OnDestroy() { return (t: any, c: any) => {} }
        `,
        '/src/Pool.ts': `
          import { Singleton, OnDestroy } from './decorators.js'

          @Singleton()
          export class Pool {
            @OnDestroy()
            shutdown() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onDestroyMethods).toEqual(['shutdown']);
    });

    it('should discover multiple @OnDestroy methods', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function OnDestroy() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, OnDestroy } from './decorators.js'

          @Singleton()
          export class Service {
            @OnDestroy()
            closeConnections() {}

            @OnDestroy()
            flushBuffers() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onDestroyMethods).toEqual([
        'closeConnections',
        'flushBuffers',
      ]);
    });

    it('should return empty array when no @OnDestroy methods', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onDestroyMethods).toEqual([]);
    });
  });

  describe('@OnInit methods', () => {
    it('should discover @OnInit method on a bean', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function OnInit() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, OnInit } from './decorators.js'

          @Singleton()
          export class Service {
            @OnInit()
            init() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onInitMethods).toEqual(['init']);
    });

    it('should discover multiple @OnInit methods', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function OnInit() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, OnInit } from './decorators.js'

          @Singleton()
          export class Service {
            @OnInit()
            initCache() {}

            @OnInit()
            loadConfig() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onInitMethods).toEqual([
        'initCache',
        'loadConfig',
      ]);
    });

    it('should return empty array when no @OnInit methods', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].onInitMethods).toEqual([]);
    });
  });

  describe('@PostProcessor detection', () => {
    it('should detect @PostProcessor on a bean', () => {
      const project = createProject({
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

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].isComponentPostProcessor).toBe(true);
    });

    it('should default isComponentPostProcessor to false', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].isComponentPostProcessor).toBe(false);
    });
  });

  describe('@PostProcessor + @Transient rejection', () => {
    it('throws InvalidDecoratorUsageError when combining @PostProcessor with @Transient', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
          export function PostProcessor() { return (t: any, c: any) => {} }
        `,
        '/src/BadProcessor.ts': `
          import { Transient, PostProcessor } from './decorators.js'

          @PostProcessor()
          @Transient()
          export class BadProcessor {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(
        /@PostProcessor cannot be combined with @Transient/,
      );
    });
  });

  describe('collection (array) type detection', () => {
    it('should detect T[] array parameter', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams).toHaveLength(1);
      expect(service.constructorParams[0].isCollection).toBe(true);
      expect(service.constructorParams[0].elementTypeName).toBe('Handler');
    });

    it('should detect Array<T> parameter', () => {
      const project = createProject({
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
            constructor(private handlers: Array<Handler>) {}
          }
        `,
      });

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams[0].isCollection).toBe(true);
      expect(service.constructorParams[0].elementTypeName).toBe('Handler');
    });

    it('should not flag non-array parameters as collection', () => {
      const project = createProject({
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

      const result = scan(project);
      const service = result.components.find(
        (b) => b.classTokenRef.className === 'Service',
      )!;

      expect(service.constructorParams[0].isCollection).toBe(false);
    });
  });

  describe('@Value fields', () => {
    it('should discover @Value on accessor field', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Value(key: string, opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value('DB_URL') accessor dbUrl!: string
          }
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].valueFields).toHaveLength(1);
      expect(result.components[0].valueFields[0].fieldName).toBe('dbUrl');
      expect(result.components[0].valueFields[0].key).toBe('DB_URL');
    });

    it('should discover @Value with default value', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Value(key: string, opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value('PORT', { default: 3000 }) accessor port!: number
          }
        `,
      });

      const result = scan(project);

      expect(result.components[0].valueFields[0].key).toBe('PORT');
      expect(result.components[0].valueFields[0].defaultValue).toBe('3000');
    });

    it('should throw InvalidDecoratorUsageError for @Value on non-accessor property', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Value(key: string, opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Config.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Config {
            @Value('PORT') port!: number
          }
        `,
      });

      expect(() => scan(project)).toThrow(/accessor/);
    });

    it('should throw InvalidDecoratorUsageError for @Value() with no arguments', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Value(key?: string, opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton, Value } from './decorators.js'

          @Singleton()
          export class Service {
            @Value() accessor dbUrl!: string
          }
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(/requires a config key argument/);
    });

    it('should return empty array when no @Value fields', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      const result = scan(project);

      expect(result.components[0].valueFields).toEqual([]);
    });
  });

  describe('abstract class rejection', () => {
    it('throws InvalidDecoratorUsageError for abstract @Transient class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/AbstractRepo.ts': `
          import { Transient } from './decorators.js'

          @Transient()
          export abstract class AbstractRepo {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(
        /Cannot apply @Transient\(\) to abstract class "AbstractRepo"/,
      );
    });

    it('throws InvalidDecoratorUsageError for abstract @Singleton class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/AbstractService.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export abstract class AbstractService {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(
        /Cannot apply @Singleton\(\) to abstract class "AbstractService"/,
      );
    });

    it('throws InvalidDecoratorUsageError for abstract @Factory class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/AbstractModule.ts': `
          import { Factory } from './decorators.js'

          @Factory()
          export abstract class AbstractModule {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(
        /Cannot apply @Factory\(\) to abstract class "AbstractModule"/,
      );
    });

    it('throws InvalidDecoratorUsageError for abstract @PostProcessor class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function PostProcessor() { return (t: any, c: any) => {} }
        `,
        '/src/AbstractProcessor.ts': `
          import { PostProcessor } from './decorators.js'

          @PostProcessor()
          export abstract class AbstractProcessor {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
      expect(() => scan(project)).toThrow(
        /Cannot apply @PostProcessor\(\) to abstract class "AbstractProcessor"/,
      );
    });

    it('allows non-abstract class extending abstract class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/AbstractRepo.ts': `
          export abstract class AbstractRepo {}
        `,
        '/src/ConcreteRepo.ts': `
          import { Singleton } from './decorators.js'
          import { AbstractRepo } from './AbstractRepo.js'

          @Singleton()
          export class ConcreteRepo extends AbstractRepo {}
        `,
      });

      const result = scan(project);
      expect(result.components).toHaveLength(1);
      expect(result.components[0].classTokenRef.className).toBe('ConcreteRepo');
    });
  });

  describe('base class extraction', () => {
    it('should extract immediate base class from source files', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/HealthIndicator.ts': `
          export abstract class HealthIndicator {
            abstract check(): { status: string }
          }
        `,
        '/src/UptimeIndicator.ts': `
          import { Singleton } from './decorators.js'
          import { HealthIndicator } from './HealthIndicator.js'

          @Singleton()
          export class UptimeIndicator extends HealthIndicator {
            check() { return { status: 'UP' } }
          }
        `,
      });

      const result = scan(project);
      const bean = result.components.find(
        (b) => b.classTokenRef.className === 'UptimeIndicator',
      )!;

      expect(bean.baseClasses).toHaveLength(1);
      expect(bean.baseClasses[0].kind).toBe('class');
      expect(bean.baseClasses[0].className).toBe('HealthIndicator');
      expect(bean.baseClasses[0].importPath).toBe('/src/HealthIndicator.ts');
    });

    it('should return empty array for class without base class', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
      });

      const result = scan(project);
      expect(result.components[0].baseClasses).toEqual([]);
    });

    it('should extract base class when both parent and child are decorated', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/BaseRepo.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class BaseRepo {}
        `,
        '/src/UserRepo.ts': `
          import { Singleton } from './decorators.js'
          import { BaseRepo } from './BaseRepo.js'

          @Singleton()
          export class UserRepo extends BaseRepo {}
        `,
      });

      const result = scan(project);
      const userRepo = result.components.find(
        (b) => b.classTokenRef.className === 'UserRepo',
      )!;

      expect(userRepo.baseClasses).toHaveLength(1);
      expect(userRepo.baseClasses[0].className).toBe('BaseRepo');
    });
  });

  describe('multiple files', () => {
    it('should scan across multiple source files', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
          export function Singleton() { return (t: any, c: any) => {} }
          export function Factory(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Repo.ts': `
          import { Transient } from './decorators.js'

          @Transient()
          export class Repo {}
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
        '/src/AppModule.ts': `
          import { Factory } from './decorators.js'

          @Factory()
          export class AppModule {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(3);
    });

    it('should ignore classes without decorators', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Transient() { return (t: any, c: any) => {} }
        `,
        '/src/Plain.ts': `
          export class Plain {}
        `,
        '/src/Decorated.ts': `
          import { Transient } from './decorators.js'

          @Transient()
          export class Decorated {}
        `,
      });

      const result = scan(project);

      expect(result.components).toHaveLength(1);
      expect(result.components[0].classTokenRef.className).toBe('Decorated');
    });
  });
});
