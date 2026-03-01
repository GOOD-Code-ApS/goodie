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
    for (const [path, content] of Object.entries(files)) {
      project.createSourceFile(path, content);
    }
    return project;
  }

  it('populates interceptedMethods metadata on beans with @Around', () => {
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
    expect(methods[0].interceptorTokenRefs).toHaveLength(1);
    expect(methods[0].interceptorTokenRefs[0].className).toBe(
      'TimingInterceptor',
    );
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
    expect(methods[0].interceptorTokenRefs[0].className).toBe(
      'AuthInterceptor',
    );
    expect(methods[0].interceptorTokenRefs[1].className).toBe('LogInterceptor');
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

  it('beforeCodegen injects AopPostProcessor bean when AOP is used', () => {
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

    const postProcessorBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'AopPostProcessor',
    );
    expect(postProcessorBean).toBeDefined();
    expect(postProcessorBean!.metadata.isBeanPostProcessor).toBe(true);
  });

  it('codegen contributes AOP imports when AOP is used', () => {
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

    expect(result.code).toContain(
      "import { AopPostProcessor } from '@goodie-ts/aop'",
    );
  });

  it('no injection/imports when no AOP decorators present', () => {
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

    expect(result.code).not.toContain('AopPostProcessor');
    expect(result.code).not.toContain('@goodie-ts/aop');

    const postProcessorBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'AopPostProcessor',
    );
    expect(postProcessorBean).toBeUndefined();
  });
});
