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

  it('should synthesize SchedulerService with scheduled bean as constructor dep', () => {
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

    expect(scheduler!.constructorDeps).toHaveLength(1);
    expect(scheduler!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'MyTask',
      importPath: '/src/MyTask.ts',
    });
  });

  it('should wire multiple scheduled beans', () => {
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

    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    expect(scheduler).toBeDefined();
    expect(scheduler!.constructorDeps).toHaveLength(2);

    const depNames = scheduler!.constructorDeps.map((d) =>
      d.tokenRef.kind === 'class' ? d.tokenRef.className : '',
    );
    expect(depNames).toContain('TaskA');
    expect(depNames).toContain('TaskB');
  });

  it('should not wire classes without @Scheduled as deps', () => {
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

    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    expect(scheduler!.constructorDeps).toHaveLength(1);
    expect(scheduler!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'Task',
      importPath: '/src/Task.ts',
    });
  });

  it('should detect @Scheduled on multiple methods in the same class', () => {
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

    const scheduler = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'SchedulerService',
    );
    // MultiTask should appear as a single dep (not duplicated per method)
    expect(scheduler!.constructorDeps).toHaveLength(1);
    expect(scheduler!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'MultiTask',
      importPath: '/src/MultiTask.ts',
    });
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

    const getScheduler = (r: typeof result1) =>
      r.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'SchedulerService',
      );

    // Should have exactly 1 dep each time — no stale accumulation
    expect(getScheduler(result1)!.constructorDeps).toHaveLength(1);
    expect(getScheduler(result2)!.constructorDeps).toHaveLength(1);
  });

  it('should not retain stale entries when a @Scheduled class is removed between runs', () => {
    const plugin = createSchedulerPlugin();

    // First run: two scheduled classes
    const project1 = new Project({ useInMemoryFileSystem: true });
    project1.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    project1.createSourceFile(
      '/src/TaskA.ts',
      `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class TaskA {
          @Scheduled({ fixedRate: 1000 })
          run() {}
        }
      `,
    );
    project1.createSourceFile(
      '/src/TaskB.ts',
      `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class TaskB {
          @Scheduled({ cron: '0 * * * * *' })
          run() {}
        }
      `,
    );

    const result1 = transformInMemory(
      project1,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    // Second run: TaskB removed
    const project2 = new Project({ useInMemoryFileSystem: true });
    project2.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    project2.createSourceFile(
      '/src/TaskA.ts',
      `
        import { Singleton, Scheduled } from './decorators.js'

        @Singleton()
        export class TaskA {
          @Scheduled({ fixedRate: 1000 })
          run() {}
        }
      `,
    );

    const result2 = transformInMemory(
      project2,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    const getScheduler = (r: typeof result1) =>
      r.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'SchedulerService',
      );

    expect(getScheduler(result1)!.constructorDeps).toHaveLength(2);
    // After removing TaskB, only TaskA should remain — no stale TaskB
    expect(getScheduler(result2)!.constructorDeps).toHaveLength(1);
    expect(getScheduler(result2)!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'TaskA',
      importPath: '/src/TaskA.ts',
    });
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
