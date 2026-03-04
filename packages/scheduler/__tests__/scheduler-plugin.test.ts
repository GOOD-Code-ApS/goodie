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
});
