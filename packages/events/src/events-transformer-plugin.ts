import type {
  ClassVisitorContext,
  IRComponentDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Create the events transformer plugin.
 *
 * Detects classes extending `ApplicationEventListener` via `visitClass` and
 * ensures they have `baseTokenRefs` so the runtime `EventBus` can discover
 * them via `getAll(ApplicationEventListener)`.
 *
 * Synthesizes an `EventBus` component that depends on `ApplicationContext` and
 * discovers listeners at startup via `@OnInit`.
 */
export function createEventsPlugin(): TransformerPlugin {
  return {
    name: 'events',

    visitClass(ctx: ClassVisitorContext): void {
      const extendsClause = ctx.classDeclaration.getExtends();
      if (!extendsClause) return;

      // Resolve via ts-morph type symbol to handle aliased imports
      // (e.g. `import { ApplicationEventListener as AEL }`)
      const baseType = extendsClause.getExpression().getType();
      const symbol = baseType.getSymbol();
      if (symbol?.getName() !== 'ApplicationEventListener') return;

      // Mark this component as an event listener so beforeCodegen can add baseTokenRefs.
      // The scanner stops at node_modules, so external base classes aren't captured
      // automatically — this ensures ApplicationEventListener is registered.
      ctx.metadata.__isEventListener = true;
    },

    beforeCodegen(
      components: IRComponentDefinition[],
    ): IRComponentDefinition[] {
      // Add baseTokenRefs for ApplicationEventListener subclasses
      for (const component of components) {
        if (!component.metadata.__isEventListener) continue;

        const baseRef = {
          kind: 'class' as const,
          className: 'ApplicationEventListener',
          importPath: '@goodie-ts/events',
        };

        // Replace any existing ref (scanner may add one with local path) or add new
        const existingIdx = component.baseTokenRefs?.findIndex(
          (r) => r.className === 'ApplicationEventListener',
        );
        if (
          existingIdx !== undefined &&
          existingIdx >= 0 &&
          component.baseTokenRefs
        ) {
          component.baseTokenRefs[existingIdx] = baseRef;
        } else if (component.baseTokenRefs) {
          component.baseTokenRefs.push(baseRef);
        } else {
          component.baseTokenRefs = [baseRef];
        }

        // Clean up internal marker — not needed at runtime
        delete component.metadata.__isEventListener;
      }

      // Always create EventBus when the plugin is installed — allows
      // @Inject() accessor events!: EventPublisher even with zero listeners
      const eventBusComponent: IRComponentDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'EventBus',
          importPath: '@goodie-ts/events',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        primary: false,
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
          onInitMethods: ['init'],
        },
        sourceLocation: {
          filePath: '@goodie-ts/events',
          line: 0,
          column: 0,
        },
      };

      return [...components, eventBusComponent];
    },
  };
}

export default createEventsPlugin;
