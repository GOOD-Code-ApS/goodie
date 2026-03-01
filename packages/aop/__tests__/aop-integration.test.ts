import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createAopPlugin } from '../src/aop-transformer-plugin.js';
import type { InterceptedMethodDescriptor } from '../src/types.js';

describe('AOP Integration', () => {
  function createProject(files: Record<string, string>) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    for (const [path, content] of Object.entries(files)) {
      project.createSourceFile(path, content);
    }
    return project;
  }

  it('full pipeline: @Singleton + @Around produces metadata, AopPostProcessor bean, and AOP import', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class TimingInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'

        @Singleton()
        class MyService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    // 1. MyService has interceptedMethods in metadata
    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    expect(myService).toBeDefined();
    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(1);
    expect(methods[0].methodName).toBe('doWork');
    expect(methods[0].interceptorTokenRefs[0].className).toBe(
      'TimingInterceptor',
    );

    // 2. AopPostProcessor synthetic bean is injected
    const aopBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'AopPostProcessor',
    );
    expect(aopBean).toBeDefined();
    expect(aopBean!.metadata.isBeanPostProcessor).toBe(true);

    // 3. Generated code contains AOP import
    expect(result.code).toContain(
      "import { AopPostProcessor } from '@goodie-ts/aop'",
    );

    // 4. Generated code contains interceptedMethods in metadata
    expect(result.code).toContain('interceptedMethods');

    // 5. Generated code contains AopPostProcessor token
    expect(result.code).toContain('token: AopPostProcessor');
  });

  it('@Before and @After decorators are also recognized', () => {
    const project = createProject({
      '/src/LogInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class LogInterceptor {}
      `,
      '/src/MetricsInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class MetricsInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Before, After } from './decorators.js'
        import { LogInterceptor } from './LogInterceptor.js'
        import { MetricsInterceptor } from './MetricsInterceptor.js'

        @Singleton()
        class MyService {
          @Before(LogInterceptor)
          @After(MetricsInterceptor)
          process() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    expect(myService).toBeDefined();
    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(1);
    expect(methods[0].methodName).toBe('process');
    expect(methods[0].interceptorTokenRefs).toHaveLength(2);
  });

  it('multiple methods can have separate interceptors', () => {
    const project = createProject({
      '/src/AuthInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class AuthInterceptor {}
      `,
      '/src/CacheInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class CacheInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { AuthInterceptor } from './AuthInterceptor.js'
        import { CacheInterceptor } from './CacheInterceptor.js'

        @Singleton()
        class MyService {
          @Around(AuthInterceptor)
          secure() {}

          @Around(CacheInterceptor)
          getData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    const myService = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyService',
    );
    const methods = myService!.metadata
      .interceptedMethods as InterceptedMethodDescriptor[];
    expect(methods).toHaveLength(2);

    const methodNames = methods.map((m) => m.methodName);
    expect(methodNames).toContain('secure');
    expect(methodNames).toContain('getData');
  });
});
