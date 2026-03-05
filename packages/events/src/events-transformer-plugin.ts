import type {
  ClassVisitorContext,
  IRBeanDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Create the events transformer plugin.
 *
 * Detects classes extending `ApplicationEventListener` via `visitClass` and
 * ensures they have `baseTokenRefs` so the runtime `EventBus` can discover
 * them via `getAll(ApplicationEventListener)`.
 *
 * Synthesizes an `EventBus` bean that depends on `ApplicationContext` and
 * discovers listeners at startup via `@PostConstruct`.
 */
export function createEventsPlugin(): TransformerPlugin {
  return {
    name: 'events',

    visitClass(ctx: ClassVisitorContext): void {
      const extendsClause = ctx.classDeclaration.getExtends();
      if (!extendsClause) return;

      const baseName = extendsClause.getExpression().getText();
      if (baseName !== 'ApplicationEventListener') return;

      // Mark this bean as an event listener so beforeCodegen can add baseTokenRefs.
      // The scanner stops at node_modules, so external base classes aren't captured
      // automatically — this ensures ApplicationEventListener is registered.
      ctx.metadata.__isEventListener = true;
    },

    beforeCodegen(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Add baseTokenRefs for ApplicationEventListener subclasses
      for (const bean of beans) {
        if (!bean.metadata.__isEventListener) continue;

        const baseRef = {
          kind: 'class' as const,
          className: 'ApplicationEventListener',
          importPath: '@goodie-ts/events',
        };

        // Replace any existing ref (scanner may add one with local path) or add new
        const existingIdx = bean.baseTokenRefs?.findIndex(
          (r) => r.className === 'ApplicationEventListener',
        );
        if (
          existingIdx !== undefined &&
          existingIdx >= 0 &&
          bean.baseTokenRefs
        ) {
          bean.baseTokenRefs[existingIdx] = baseRef;
        } else if (bean.baseTokenRefs) {
          bean.baseTokenRefs.push(baseRef);
        } else {
          bean.baseTokenRefs = [baseRef];
        }
      }

      // Always create EventBus when the plugin is installed — allows
      // @Inject() accessor events!: EventPublisher even with zero listeners
      const eventBusBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'EventBus',
          importPath: '@goodie-ts/events',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'ApplicationContext',
              importPath: '@goodie-ts/core',
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/events',
              line: 0,
              column: 0,
            },
          },
        ],
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
        metadata: {
          postConstructMethods: ['init'],
        },
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
