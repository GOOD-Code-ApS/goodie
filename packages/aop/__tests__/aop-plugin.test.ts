import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createAopPlugin } from '../src/aop-transformer-plugin.js';
import type { InterceptedMethodDescriptor } from '../src/types.js';

describe('AOP Plugin', () => {
  function createProject(files: Record<string, string>) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    for (const [filePath, content] of Object.entries(files)) {
      project.createSourceFile(filePath, content);
    }
    return project;
  }

  it('populates interceptedMethods metadata with full InterceptorRef', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class TimingInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton() class MyService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);
    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    expect(myService).toBeDefined();
    expect(myService!.metadata.interceptedMethods).toBeDefined();

    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(1);
    expect(methods[0].methodName).toBe('doWork');
    expect(methods[0].interceptors).toHaveLength(1);
    expect(methods[0].interceptors[0].className).toBe('TimingInterceptor');
    expect(methods[0].interceptors[0].importPath).toBe(
      '/src/TimingInterceptor.ts',
    );
    expect(methods[0].interceptors[0].adviceType).toBe('around');
    expect(methods[0].interceptors[0].order).toBe(0);
  });

  it('multiple interceptors on same method are ordered', () => {
    const project = createProject({
      '/src/LogInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class LogInterceptor {}
      `,
      '/src/AuthInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class AuthInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { LogInterceptor } from './LogInterceptor.js'
        import { AuthInterceptor } from './AuthInterceptor.js'
        @Singleton() class MyService {
          @Around(LogInterceptor, { order: 2 })
          @Around(AuthInterceptor, { order: 1 })
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);
    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(1);
    // AuthInterceptor (order 1) should come before LogInterceptor (order 2)
    expect(methods[0].interceptors[0].className).toBe('AuthInterceptor');
    expect(methods[0].interceptors[1].className).toBe('LogInterceptor');
  });

  it('different advice types produce correct adviceType', () => {
    const project = createProject({
      '/src/LogAdvice.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class LogAdvice {}
      `,
      '/src/MetricsAdvice.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class MetricsAdvice {}
      `,
      '/src/AuthInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class AuthInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Before, After, Around } from './decorators.js'
        import { LogAdvice } from './LogAdvice.js'
        import { MetricsAdvice } from './MetricsAdvice.js'
        import { AuthInterceptor } from './AuthInterceptor.js'
        @Singleton() class MyService {
          @Before(LogAdvice)
          @After(MetricsAdvice)
          @Around(AuthInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);
    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(1);

    const adviceTypes = methods[0].interceptors.map((i) => i.adviceType);
    expect(adviceTypes).toContain('before');
    expect(adviceTypes).toContain('after');
    expect(adviceTypes).toContain('around');
  });

  it('no metadata when no AOP decorators present', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() class MyService {
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);
    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    expect(myService!.metadata.interceptedMethods).toBeUndefined();
  });

  it('same-name interceptors in different files do not collide', () => {
    const project = createProject({
      '/src/interceptors/LogInterceptor.ts': `
        import { Singleton } from '../decorators.js'
        @Singleton() export class LogInterceptor {}
      `,
      '/src/other/LogInterceptor.ts': `
        import { Singleton } from '../decorators.js'
        @Singleton() export class LogInterceptor {}
      `,
      '/src/ServiceA.ts': `
        import { Singleton, Around } from './decorators.js'
        import { LogInterceptor } from './interceptors/LogInterceptor.js'
        @Singleton() class ServiceA {
          @Around(LogInterceptor)
          doWork() {}
        }
      `,
      '/src/ServiceB.ts': `
        import { Singleton, Around } from './decorators.js'
        import { LogInterceptor } from './other/LogInterceptor.js'
        @Singleton() class ServiceB {
          @Around(LogInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);
    const serviceA = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'ServiceA',
    );
    const serviceB = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'ServiceB',
    );

    const methodsA = serviceA!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    const methodsB = serviceB!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];

    // Both have interceptors named LogInterceptor but from different paths
    expect(methodsA[0].interceptors[0].importPath).toBe(
      '/src/interceptors/LogInterceptor.ts',
    );
    expect(methodsB[0].interceptors[0].importPath).toBe(
      '/src/other/LogInterceptor.ts',
    );
  });

  it('no AOP imports when no decorators present', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() class MyService {
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/gen.ts', [
      createAopPlugin(),
    ]);

    expect(result.code).not.toContain('@goodie-ts/aop');
  });
});
