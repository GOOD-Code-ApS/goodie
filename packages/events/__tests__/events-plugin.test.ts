import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { createEventsPlugin } from '../src/events-transformer-plugin.js';

const DECORATOR_STUBS = `
export function Singleton() { return (t: any, c: any) => {} }
`;

const EVENT_STUBS = `
export class ApplicationEvent {}
export abstract class ApplicationEventListener<E extends ApplicationEvent = ApplicationEvent> {
  abstract readonly eventType: new (...args: any[]) => E;
  supports(_event: ApplicationEvent): boolean { return true; }
  abstract onApplicationEvent(event: E): Promise<void> | void;
  get order(): number { return 0; }
}
`;

function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  project.createSourceFile('/src/events.ts', EVENT_STUBS);

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

    const eventBus = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus).toBeDefined();
    expect(eventBus!.scope).toBe('singleton');
    expect(eventBus!.eager).toBe(true);
    expect(eventBus!.metadata).toEqual({
      onInitMethods: ['init'],
    });
    expect(eventBus!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'EventPublisher',
        importPath: '@goodie-ts/events',
      },
    ]);
  });

  it('should have ApplicationContext as sole dep on EventBus', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    const eventBus = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'EventBus',
    );
    expect(eventBus!.constructorDeps).toHaveLength(1);
    expect(eventBus!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'ApplicationContext',
      importPath: '@goodie-ts/core',
    });
  });

  it('should add baseTokenRefs for ApplicationEventListener subclasses', () => {
    const result = createTestProject({
      '/src/UserCreatedEvent.ts': `
        import { ApplicationEvent } from './events.js'

        export class UserCreatedEvent extends ApplicationEvent {
          constructor(public userId: string) { super(); }
        }
      `,
      '/src/UserListener.ts': `
        import { Singleton } from './decorators.js'
        import { ApplicationEventListener } from './events.js'
        import { UserCreatedEvent } from './UserCreatedEvent.js'

        @Singleton()
        export class UserListener extends ApplicationEventListener<UserCreatedEvent> {
          readonly eventType = UserCreatedEvent;
          onApplicationEvent(event: UserCreatedEvent) {}
        }
      `,
    });

    const listener = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'UserListener',
    );
    expect(listener).toBeDefined();
    expect(listener!.baseTokenRefs).toContainEqual({
      kind: 'class',
      className: 'ApplicationEventListener',
      importPath: '@goodie-ts/events',
    });
  });

  it('should add baseTokenRefs for multiple listeners', () => {
    const result = createTestProject({
      '/src/MyEvent.ts': `
        import { ApplicationEvent } from './events.js'
        export class MyEvent extends ApplicationEvent {}
      `,
      '/src/ListenerA.ts': `
        import { Singleton } from './decorators.js'
        import { ApplicationEventListener } from './events.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerA extends ApplicationEventListener<MyEvent> {
          readonly eventType = MyEvent;
          onApplicationEvent(event: MyEvent) {}
        }
      `,
      '/src/ListenerB.ts': `
        import { Singleton } from './decorators.js'
        import { ApplicationEventListener } from './events.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class ListenerB extends ApplicationEventListener<MyEvent> {
          readonly eventType = MyEvent;
          onApplicationEvent(event: MyEvent) {}
        }
      `,
    });

    const listenerA = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'ListenerA',
    );
    const listenerB = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'ListenerB',
    );

    expect(listenerA!.baseTokenRefs).toContainEqual({
      kind: 'class',
      className: 'ApplicationEventListener',
      importPath: '@goodie-ts/events',
    });
    expect(listenerB!.baseTokenRefs).toContainEqual({
      kind: 'class',
      className: 'ApplicationEventListener',
      importPath: '@goodie-ts/events',
    });
  });

  it('should not add baseTokenRefs to non-listener classes', () => {
    const result = createTestProject({
      '/src/PlainService.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class PlainService {
          doWork() {}
        }
      `,
    });

    const plain = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'PlainService',
    );
    expect(plain!.metadata.__isEventListener).toBeUndefined();
    expect(plain!.baseTokenRefs).toBeUndefined();
  });

  it('should generate valid code with EventBus import', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    expect(result.code).toContain('EventBus');
    expect(result.code).toContain('@goodie-ts/events');
  });

  it('should clear state between watch-mode rebuilds', () => {
    const plugin = createEventsPlugin();

    const makeProject = () => {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
      project.createSourceFile('/src/events.ts', EVENT_STUBS);
      project.createSourceFile(
        '/src/MyEvent.ts',
        `
        import { ApplicationEvent } from './events.js'
        export class MyEvent extends ApplicationEvent {}
      `,
      );
      project.createSourceFile(
        '/src/Listener.ts',
        `
        import { Singleton } from './decorators.js'
        import { ApplicationEventListener } from './events.js'
        import { MyEvent } from './MyEvent.js'

        @Singleton()
        export class Listener extends ApplicationEventListener<MyEvent> {
          readonly eventType = MyEvent;
          onApplicationEvent(event: MyEvent) {}
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

    // Second transform with the same plugin instance
    const result2 = transformInMemory(
      makeProject(),
      '/out/AppContext.generated.ts',
      [plugin],
    );

    const getListener = (r: typeof result1) =>
      r.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Listener',
      );

    // baseTokenRefs should not accumulate across rebuilds
    const refs1 = getListener(result1)!.baseTokenRefs ?? [];
    const refs2 = getListener(result2)!.baseTokenRefs ?? [];
    const eventListenerRefs1 = refs1.filter(
      (r) => r.className === 'ApplicationEventListener',
    );
    const eventListenerRefs2 = refs2.filter(
      (r) => r.className === 'ApplicationEventListener',
    );
    expect(eventListenerRefs1).toHaveLength(1);
    expect(eventListenerRefs2).toHaveLength(1);
  });
});
