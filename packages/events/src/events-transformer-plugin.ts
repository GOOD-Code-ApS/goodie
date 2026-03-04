import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import { SyntaxKind } from 'ts-morph';

interface ListenerMethodInfo {
  methodName: string;
  eventTypeName: string;
  eventTypeImportPath: string;
  order: number;
}

interface ListenerClassInfo {
  className: string;
  filePath: string;
  methods: ListenerMethodInfo[];
}

/**
 * Create the events transformer plugin.
 *
 * Scans `@EventListener` decorators on methods at compile time and synthesizes
 * an `EventBus` bean with a custom factory that statically registers all listeners.
 * No runtime Symbol.metadata scanning needed.
 */
export function createEventsPlugin(): TransformerPlugin {
  /** Classes that contain at least one @EventListener method. Keyed by filePath:className. */
  const listenerClasses = new Map<string, ListenerClassInfo>();

  return {
    name: 'events',

    beforeScan(): void {
      listenerClasses.clear();
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'EventListener') continue;

        const args = decorator.getArguments();
        if (args.length === 0) continue;

        // Extract event type name and import path
        const eventTypeArg = args[0];
        const eventTypeName = eventTypeArg.getText();

        // Resolve the import path for the event type
        const sourceFile = ctx.methodDeclaration.getSourceFile();
        let eventTypeImportPath = '';

        for (const imp of sourceFile.getImportDeclarations()) {
          const namedImport = imp
            .getNamedImports()
            .find((ni) => ni.getName() === eventTypeName);
          if (namedImport) {
            const moduleFile = imp.getModuleSpecifierSourceFile();
            eventTypeImportPath = moduleFile?.getFilePath() ?? '';
            break;
          }
        }

        // Extract order from options (second argument)
        let order = 0;
        if (args.length > 1) {
          const opts = args[1];
          if (opts.isKind(SyntaxKind.ObjectLiteralExpression)) {
            const orderProp = opts.getProperty('order');
            if (orderProp?.isKind(SyntaxKind.PropertyAssignment)) {
              const initializer = orderProp.getInitializer();
              if (initializer) {
                const parsed = Number(initializer.getText());
                if (!Number.isNaN(parsed)) order = parsed;
              }
            }
          }
        }

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = listenerClasses.get(key) ?? {
          className: ctx.className,
          filePath: ctx.filePath,
          methods: [],
        };
        existing.methods.push({
          methodName: ctx.methodName,
          eventTypeName,
          eventTypeImportPath,
          order,
        });
        listenerClasses.set(key, existing);
        break; // Only process first @EventListener per method
      }
    },

    beforeCodegen(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Always create EventBus when the plugin is installed — allows
      // @Inject() accessor events!: EventPublisher even with zero listeners
      const listenerDeps: IRBeanDefinition['constructorDeps'] = [];
      const matchedClasses: ListenerClassInfo[] = [];

      for (const bean of beans) {
        if (bean.tokenRef.kind !== 'class') continue;

        const key = `${bean.tokenRef.importPath}:${bean.tokenRef.className}`;
        const info = listenerClasses.get(key);
        if (info) {
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
          matchedClasses.push(info);
        }
      }

      // Build custom factory that statically registers all listeners
      const params = listenerDeps.map((_, i) => `dep${i}: any`).join(', ');
      const registerCalls: string[] = [];

      for (let i = 0; i < matchedClasses.length; i++) {
        for (const method of matchedClasses[i].methods) {
          registerCalls.push(
            `    __bus.register(dep${i}, '${method.methodName}', ${method.eventTypeName}, ${method.order})`,
          );
        }
      }

      let customFactory: string;
      if (registerCalls.length > 0) {
        customFactory = `(${params}) => {
    const __bus = new EventBus()
${registerCalls.join('\n')}
    __bus.sortListeners()
    return __bus
  }`;
      } else {
        customFactory = '() => new EventBus()';
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
        customFactory,
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

    codegen(): CodegenContribution {
      // Import event type classes used in the factory
      const imports: string[] = [];
      const importedTypes = new Set<string>();

      for (const info of listenerClasses.values()) {
        for (const method of info.methods) {
          if (
            method.eventTypeImportPath &&
            !importedTypes.has(method.eventTypeName)
          ) {
            importedTypes.add(method.eventTypeName);
            imports.push(
              `import { ${method.eventTypeName} } from '${method.eventTypeImportPath}'`,
            );
          }
        }
      }

      return { imports };
    },
  };
}

export default createEventsPlugin;
