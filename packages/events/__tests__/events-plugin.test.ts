import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { createEventsPlugin } from '../src/events-transformer-plugin.js';

const DECORATOR_STUBS = `
export function Singleton() { return (t: any, c: any) => {} }
export function EventListener(eventType: any, opts?: any) { return (t: any, c: any) => {} }
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

  return transformInMemory(project, outputPath, [createEventsPlugin()]);
}

describe('Events Transformer Plugin', () => {
  it('should synthesize EventBus bean even with zero listeners', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {
          doWork() {}
        }
      `,
    });

    const eventBus = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus).toBeDefined();
    expect(eventBus!.scope).toBe('singleton');
    expect(eventBus!.eager).toBe(true);
    expect(eventBus!.constructorDeps).toHaveLength(0);
    expect(eventBus!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'EventPublisher',
        importPath: '@goodie-ts/events',
      },
    ]);
  });

  it('should wire listener beans as constructor deps on EventBus', () => {
    const result = createTestProject({
      '/src/UserCreatedEvent.ts': `
        export class UserCreatedEvent {
          constructor(public userId: string) {}
        }
      `,
      '/src/UserListener.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { UserCreatedEvent } from './UserCreatedEvent.js'

        @Singleton()
        export class UserListener {
          @EventListener(UserCreatedEvent)
          onUserCreated(event: UserCreatedEvent) {}
        }
      `,
    });

    const eventBus = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus).toBeDefined();
    expect(eventBus!.constructorDeps).toHaveLength(1);
    expect(eventBus!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'UserListener',
      importPath: '/src/UserListener.ts',
    });
  });

  it('should wire multiple listener beans', () => {
    const result = createTestProject({
      '/src/MyEvent.ts': `
        export class MyEvent {}
      `,
      '/src/ListenerA.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerA {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
      '/src/ListenerB.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerB {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
    });

    const eventBus = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus).toBeDefined();
    expect(eventBus!.constructorDeps).toHaveLength(2);

    const depNames = eventBus!.constructorDeps.map((d) =>
      d.tokenRef.kind === 'class' ? d.tokenRef.className : '',
    );
    expect(depNames).toContain('ListenerA');
    expect(depNames).toContain('ListenerB');
  });

  it('should not wire classes without @EventListener as deps', () => {
    const result = createTestProject({
      '/src/MyEvent.ts': `
        export class MyEvent {}
      `,
      '/src/Listener.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class Listener {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
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

    const eventBus = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus!.constructorDeps).toHaveLength(1);
    expect(eventBus!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'Listener',
      importPath: '/src/Listener.ts',
    });
  });

  it('should detect @EventListener on multiple methods in the same class', () => {
    const result = createTestProject({
      '/src/EventA.ts': `
        export class EventA {}
      `,
      '/src/EventB.ts': `
        export class EventB {}
      `,
      '/src/MultiListener.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { EventA } from './EventA.js'
        import { EventB } from './EventB.js'

        @Singleton()
        export class MultiListener {
          @EventListener(EventA)
          onA(event: EventA) {}

          @EventListener(EventB)
          onB(event: EventB) {}
        }
      `,
    });

    const eventBus = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    // MultiListener should appear as a single dep (not duplicated per method)
    expect(eventBus!.constructorDeps).toHaveLength(1);
    expect(eventBus!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'MultiListener',
      importPath: '/src/MultiListener.ts',
    });
  });

  it('should generate valid code with EventBus import', () => {
    const result = createTestProject({
      '/src/MyEvent.ts': `
        export class MyEvent {}
      `,
      '/src/Listener.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class Listener {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
    });

    expect(result.code).toContain('EventBus');
    expect(result.code).toContain('@goodie-ts/events');
  });

  it('should generate relative import paths for event types (not absolute)', () => {
    const result = createTestProject({
      '/src/UserCreatedEvent.ts': `
        export class UserCreatedEvent {
          constructor(public userId: string) {}
        }
      `,
      '/src/UserListener.ts': `
        import { Singleton, EventListener } from './decorators.js'
        import { UserCreatedEvent } from './UserCreatedEvent.js'

        @Singleton()
        export class UserListener {
          @EventListener(UserCreatedEvent)
          onUserCreated(event: UserCreatedEvent) {}
        }
      `,
    });

    // Event type import should be relative, not an absolute path like /src/UserCreatedEvent.ts
    expect(result.code).toContain('UserCreatedEvent');
    expect(result.code).not.toMatch(/from\s+['"]\//);
  });

  it('should clear state between watch-mode rebuilds', () => {
    const plugin = createEventsPlugin();

    const makeProject = () => {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
      project.createSourceFile('/src/MyEvent.ts', 'export class MyEvent {}');
      project.createSourceFile(
        '/src/Listener.ts',
        `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class Listener {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
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

    const getBus = (r: typeof result1) =>
      r.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
      );

    // Should have exactly 1 dep each time — no stale accumulation
    expect(getBus(result1)!.constructorDeps).toHaveLength(1);
    expect(getBus(result2)!.constructorDeps).toHaveLength(1);
  });

  it('should not retain stale entries when an @EventListener class is removed between runs', () => {
    const plugin = createEventsPlugin();

    // First run: two listener classes
    const project1 = new Project({ useInMemoryFileSystem: true });
    project1.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    project1.createSourceFile('/src/MyEvent.ts', 'export class MyEvent {}');
    project1.createSourceFile(
      '/src/ListenerA.ts',
      `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerA {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
    );
    project1.createSourceFile(
      '/src/ListenerB.ts',
      `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerB {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
    );

    const result1 = transformInMemory(
      project1,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    // Second run: ListenerB removed
    const project2 = new Project({ useInMemoryFileSystem: true });
    project2.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    project2.createSourceFile('/src/MyEvent.ts', 'export class MyEvent {}');
    project2.createSourceFile(
      '/src/ListenerA.ts',
      `
        import { Singleton, EventListener } from './decorators.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerA {
          @EventListener(MyEvent)
          handle(event: MyEvent) {}
        }
      `,
    );

    const result2 = transformInMemory(
      project2,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    const getBus = (r: typeof result1) =>
      r.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
      );

    expect(getBus(result1)!.constructorDeps).toHaveLength(2);
    // After removing ListenerB, only ListenerA should remain — no stale ListenerB
    expect(getBus(result2)!.constructorDeps).toHaveLength(1);
    expect(getBus(result2)!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'ListenerA',
      importPath: '/src/ListenerA.ts',
    });
  });
});
