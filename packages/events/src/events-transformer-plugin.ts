import type {
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

interface ListenerClassInfo {
  className: string;
  filePath: string;
}

/**
 * Create the events transformer plugin.
 *
 * Scans `@EventListener` decorators on methods and synthesizes an `EventBus`
 * bean with individual constructor deps on all listener beans.
 */
export function createEventsPlugin(): TransformerPlugin {
  /** Classes that contain at least one @EventListener method. Keyed by filePath:className. */
  const listenerClasses = new Map<string, ListenerClassInfo>();

  return {
    name: 'events',

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'EventListener') continue;

        const key = `${ctx.filePath}:${ctx.className}`;
        if (!listenerClasses.has(key)) {
          listenerClasses.set(key, {
            className: ctx.className,
            filePath: ctx.filePath,
          });
        }
        break; // One match per method is enough — we just need to know the class has listeners
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Always create EventBus when the plugin is installed — allows
      // @Inject() accessor events!: EventPublisher even with zero listeners
      const listenerDeps: IRBeanDefinition['constructorDeps'] = [];

      for (const bean of beans) {
        if (bean.tokenRef.kind !== 'class') continue;

        const key = `${bean.tokenRef.importPath}:${bean.tokenRef.className}`;
        if (listenerClasses.has(key)) {
          listenerDeps.push({
            tokenRef: {
              kind: 'class',
              className: bean.tokenRef.className,
              importPath: bean.tokenRef.importPath,
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/events',
              line: 0,
              column: 0,
            },
          });
        }
      }

      const eventBusBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'EventBus',
          importPath: '@goodie-ts/events',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        constructorDeps: listenerDeps,
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        baseTokenRefs: [
          {
            kind: 'class',
            className: 'EventPublisher',
            importPath: '@goodie-ts/events',
          },
        ],
        metadata: {},
        sourceLocation: {
          filePath: '@goodie-ts/events',
          line: 0,
          column: 0,
        },
      };

      return [...beans, eventBusBean];
    },
  };
}

export default createEventsPlugin;
