import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { createSchedulerPlugin } from '../src/scheduler-transformer-plugin.js';

const DECORATOR_STUBS = `
export function Singleton() { return (t: any, c: any) => {} }
export function Scheduled(opts: any) { return (t: any, c: any) => {} }
`;

function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, outputPath, [createSchedulerPlugin()]);
}

describe('Scheduler Transformer Plugin', () => {
  it('should not synthesize SchedulerService when no @Scheduled methods exist', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {
          doWork() {}
        }
      `,
    });

    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    expect(scheduler).toBeUndefined();
  });

  it('should synthesize SchedulerService with ApplicationContext as sole dep', () => {
    const result = createTestProject({
      '/src/MyTask.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class MyTask {
          @Scheduled({ fixedRate: 5000 })
          run() {}
        }
      `,
    });

    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    expect(scheduler).toBeDefined();
    expect(scheduler!.scope).toBe('singleton');
    expect(scheduler!.eager).toBe(true);
    expect(scheduler!.metadata).toEqual({
      postConstructMethods: ['start'],
      preDestroyMethods: ['stop'],
    });

    // Single dep: ApplicationContext (not the scheduled beans)
    expect(scheduler!.constructorDeps).toHaveLength(1);
    expect(scheduler!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'ApplicationContext',
      importPath: '@goodie-ts/core',
    });
  });

  it('should store scheduledMethods metadata on user beans', () => {
    const result = createTestProject({
      '/src/MyTask.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class MyTask {
          @Scheduled({ fixedRate: 5000 })
          run() {}
        }
      `,
    });

    const myTask = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'MyTask',
    );
    expect(myTask).toBeDefined();
    expect(myTask!.metadata.scheduledMethods).toEqual([
      {
        methodName: 'run',
        cron: undefined,
        fixedRate: 5000,
        fixedDelay: undefined,
        concurrent: false,
      },
    ]);
  });

  it('should store metadata for multiple scheduled methods on the same class', () => {
    const result = createTestProject({
      '/src/MultiTask.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class MultiTask {
          @Scheduled({ fixedRate: 1000 })
          taskOne() {}

          @Scheduled({ cron: '0 0 * * * *' })
          taskTwo() {}
        }
      `,
    });

    const multiTask = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'MultiTask',
    );
    expect(multiTask!.metadata.scheduledMethods).toEqual([
      {
        methodName: 'taskOne',
        cron: undefined,
        fixedRate: 1000,
        fixedDelay: undefined,
        concurrent: false,
      },
      {
        methodName: 'taskTwo',
        cron: '0 0 * * * *',
        fixedRate: undefined,
        fixedDelay: undefined,
        concurrent: false,
      },
    ]);
  });

  it('should store metadata across multiple scheduled beans', () => {
    const result = createTestProject({
      '/src/TaskA.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class TaskA {
          @Scheduled({ cron: '0 * * * * *' })
          run() {}
        }
      `,
      '/src/TaskB.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class TaskB {
          @Scheduled({ fixedDelay: 1000 })
          run() {}
        }
      `,
    });

    const taskA = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'TaskA',
    );
    const taskB = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'TaskB',
    );
    expect(taskA!.metadata.scheduledMethods).toHaveLength(1);
    expect(taskB!.metadata.scheduledMethods).toHaveLength(1);

    // SchedulerService should exist with only ApplicationContext dep
    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    expect(scheduler).toBeDefined();
    expect(scheduler!.constructorDeps).toHaveLength(1);
  });

  it('should not add metadata to classes without @Scheduled', () => {
    const result = createTestProject({
      '/src/Task.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class Task {
          @Scheduled({ fixedRate: 1000 })
          run() {}
        }
      `,
      '/src/PlainService.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class PlainService {
          doWork() {}
        }
      `,
    });

    const plain = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'PlainService',
    );
    expect(plain!.metadata.scheduledMethods).toBeUndefined();
  });

  it('should generate valid code with SchedulerService import', () => {
    const result = createTestProject({
      '/src/Task.ts': `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class Task {
          @Scheduled({ fixedRate: 1000 })
          run() {}
        }
      `,
    });

    expect(result.code).toContain('SchedulerService');
    expect(result.code).toContain('@goodie-ts/scheduler');
  });

  it('should clear state between watch-mode rebuilds', () => {
    const plugin = createSchedulerPlugin();

    const makeProject = () => {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
      project.createSourceFile(
        '/src/Task.ts',
        `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class Task {
          @Scheduled({ fixedRate: 1000 })
          run() {}
        }
      `,
      );
      return project;
    };

    // First transform
    const result1 = transformInMemory(
      makeProject(),
      '/out/AppContext.generated.ts',
      [plugin],
    );

    // Second transform with the same plugin instance (simulates watch-mode rebuild)
    const result2 = transformInMemory(
      makeProject(),
      '/out/AppContext.generated.ts',
      [plugin],
    );

    const getTask = (r: typeof result1) =>
      r.beans.find(
        (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Task',
      );

    // Should have exactly 1 scheduled method each time — no stale accumulation
    expect(
      (getTask(result1)!.metadata.scheduledMethods as unknown[]).length,
    ).toBe(1);
    expect(
      (getTask(result2)!.metadata.scheduledMethods as unknown[]).length,
    ).toBe(1);
  });

  it('should reject @Scheduled with an empty cron expression', () => {
    expect(() =>
      createTestProject({
        '/src/Task.ts': `
          import { Singleton, Scheduled } from './decorators.js'

          @Singleton()
          export class Task {
            @Scheduled({ cron: '' })
            run() {}
          }
        `,
      }),
    ).toThrow(/empty 'cron' expression/);
  });

  it('should reject @Scheduled with no scheduling mode specified', () => {
    expect(() =>
      createTestProject({
        '/src/Task.ts': `
          import { Singleton, Scheduled } from './decorators.js'

          @Singleton()
          export class Task {
            @Scheduled({ concurrent: true })
            run() {}
          }
        `,
      }),
    ).toThrow(/must specify exactly one/);
  });

  it('should reject @Scheduled with multiple scheduling modes', () => {
    expect(() =>
      createTestProject({
        '/src/Task.ts': `
          import { Singleton, Scheduled } from './decorators.js'

          @Singleton()
          export class Task {
            @Scheduled({ cron: '0 * * * * *', fixedRate: 1000 })
            run() {}
          }
        `,
      }),
    ).toThrow(/multiple modes/);
  });
});
