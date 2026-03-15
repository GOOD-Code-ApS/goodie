import type {
  ClassVisitorContext,
  IRComponentDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Options for the Kysely transformer plugin. */
export type KyselyPluginOptions = Record<string, never>;

/** Internal tracking of @Transactional annotations found during method visiting. */
interface TransactionalMethodInfo {
  methodName: string;
  propagation: 'REQUIRED' | 'REQUIRES_NEW';
}

/**
 * Create the Kysely transformer plugin.
 *
 * Scans @Transactional decorators on methods and wires
 * TransactionalInterceptor as an AOP interceptor dependency at compile time.
 *
 * Registers @Migration decorated classes as components so they are discovered
 * by the MigrationRunner library component via collection injection on AbstractMigration.
 *
 * **Limitation:** Propagation is detected via AST text matching
 * (`text.includes('REQUIRES_NEW')`). Only string literal values in the
 * decorator argument are supported — const references or computed values
 * will fall back to `'REQUIRED'` silently.
 */
export function createKyselyPlugin(
  _options?: KyselyPluginOptions,
): TransformerPlugin {
  const classTransactionalInfo = new Map<string, TransactionalMethodInfo[]>();

  return {
    name: 'kysely',

    visitClass(ctx: ClassVisitorContext): void {
      // Detect @Migration('name') — register as a component so the scanner picks it up
      for (const decorator of ctx.classDeclaration.getDecorators()) {
        if (decorator.getName() !== 'Migration') continue;
        ctx.registerComponent({
          scope: 'singleton',
          decoratorName: 'Migration',
        });
        break;
      }
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'Transactional') continue;

        // Parse propagation from decorator arguments
        let propagation: 'REQUIRED' | 'REQUIRES_NEW' = 'REQUIRED';
        const args = decorator.getArguments();
        if (args.length > 0) {
          const text = args[0].getText();
          if (text.includes('REQUIRES_NEW')) {
            propagation = 'REQUIRES_NEW';
          }
        }

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classTransactionalInfo.get(key) ?? [];
        existing.push({ methodName: ctx.methodName, propagation });
        classTransactionalInfo.set(key, existing);
      }
    },

    afterResolve(components: IRComponentDefinition[]): IRComponentDefinition[] {
      // Wire @Transactional interceptor metadata onto components
      for (const component of components) {
        const className =
          component.tokenRef.kind === 'class'
            ? component.tokenRef.className
            : undefined;
        if (!className) continue;

        const key = `${component.tokenRef.importPath}:${className}`;
        const infos = classTransactionalInfo.get(key);
        if (!infos || infos.length === 0) continue;

        const existing = (component.metadata.interceptedMethods ??
          []) as Array<{
          methodName: string;
          interceptors: Array<{
            className: string;
            importPath: string;
            adviceType: string;
            order: number;
            metadata?: Record<string, unknown>;
          }>;
        }>;

        for (const info of infos) {
          const methodEntry = existing.find(
            (m) => m.methodName === info.methodName,
          );

          const interceptorRef = {
            className: 'TransactionalInterceptor',
            importPath: '@goodie-ts/kysely',
            adviceType: 'around' as const,
            order: -40, // Runs after logging (-100), before cache (-50), before resilience
            metadata: { propagation: info.propagation },
          };

          if (methodEntry) {
            methodEntry.interceptors.push(interceptorRef);
          } else {
            existing.push({
              methodName: info.methodName,
              interceptors: [interceptorRef],
            });
          }
        }

        component.metadata.interceptedMethods = existing;
      }

      return components;
    },
  };
}

export default createKyselyPlugin;
