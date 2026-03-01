import type {
  ClassVisitorContext,
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Options for the Kysely transformer plugin. */
export interface KyselyPluginOptions {
  /**
   * Explicit class name of the bean that provides a `Kysely<...>` property.
   * Overrides auto-detection. Use this to disambiguate when multiple classes
   * expose a `Kysely` property.
   */
  database?: string;
}

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
 * **Auto-detection:** The plugin scans decorated classes for properties typed
 * as `Kysely<...>` and auto-wires the owning class as a TransactionManager
 * constructor dependency. Use `options.database` to override when multiple
 * classes expose a `Kysely` property.
 *
 * **Limitation:** Propagation is detected via AST text matching
 * (`text.includes('REQUIRES_NEW')`). Only string literal values in the
 * decorator argument are supported — const references or computed values
 * will fall back to `'REQUIRED'` silently.
 */
export function createKyselyPlugin(
  options?: KyselyPluginOptions,
): TransformerPlugin {
  const classTransactionalInfo = new Map<string, TransactionalMethodInfo[]>();

  /** Classes discovered with a `Kysely<...>` property. Keyed by filePath:className. */
  const kyselyProviders: Array<{ className: string; filePath: string }> = [];

  return {
    name: 'kysely',

    visitClass(ctx: ClassVisitorContext): void {
      for (const prop of ctx.classDeclaration.getProperties()) {
        // Check the type annotation text (AST-level), not the resolved type.
        // This avoids requiring the 'kysely' package to be resolvable at transform time.
        const typeAnnotation = prop.getTypeNode()?.getText();
        if (typeAnnotation?.startsWith('Kysely<')) {
          kyselyProviders.push({
            className: ctx.className,
            filePath: ctx.filePath,
          });
          break; // one match per class is enough
        }
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

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      let needsInterceptor = false;

      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        const key = `${bean.tokenRef.importPath}:${className}`;
        const infos = classTransactionalInfo.get(key);
        if (!infos || infos.length === 0) continue;

        needsInterceptor = true;

        const existing = (bean.metadata.interceptedMethods ?? []) as Array<{
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

        bean.metadata.interceptedMethods = existing;
      }

      if (!needsInterceptor) return beans;

      // Resolve the database bean for auto-wiring TransactionManager.
      // Priority: explicit `database` option > auto-detected Kysely provider.
      const databaseDeps = resolveKyselyProvider(
        beans,
        options?.database,
        kyselyProviders,
      );

      // Add synthetic TransactionManager bean.
      const transactionManagerBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'TransactionManager',
          importPath: '@goodie-ts/kysely',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: databaseDeps,
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: {
          filePath: '@goodie-ts/kysely',
          line: 0,
          column: 0,
        },
      };

      // Add synthetic TransactionalInterceptor bean (depends on TransactionManager).
      const transactionalInterceptorBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'TransactionalInterceptor',
          importPath: '@goodie-ts/kysely',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'TransactionManager',
              importPath: '@goodie-ts/kysely',
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/kysely',
              line: 0,
              column: 0,
            },
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: {
          filePath: '@goodie-ts/kysely',
          line: 0,
          column: 0,
        },
      };

      return [...beans, transactionManagerBean, transactionalInterceptorBean];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasTransactional = beans.some((b) => {
        const methods = b.metadata.interceptedMethods as
          | Array<{
              interceptors: Array<{ className: string }>;
            }>
          | undefined;
        return methods?.some((m) =>
          m.interceptors.some(
            (i) => i.className === 'TransactionalInterceptor',
          ),
        );
      });

      if (!hasTransactional) return {};

      // TransactionManager and TransactionalInterceptor imports are already
      // generated by collectClassImports (they are synthetic bean tokens).
      // Only need to contribute the buildInterceptorChain import.
      return {
        imports: ["import { buildInterceptorChain } from '@goodie-ts/aop'"],
      };
    },
  };
}

/**
 * Resolve which bean provides the Kysely instance for TransactionManager auto-wiring.
 *
 * Priority:
 * 1. Explicit `database` option (string class name)
 * 2. Auto-detected class with a `Kysely<...>` property (single match)
 * 3. No wiring (zero matches, or multiple matches without explicit option)
 */
function resolveKyselyProvider(
  beans: IRBeanDefinition[],
  explicitDatabase: string | undefined,
  autoDetected: Array<{ className: string; filePath: string }>,
): IRBeanDefinition['constructorDeps'] {
  // Determine target class name
  let targetClassName: string | undefined;

  if (explicitDatabase) {
    targetClassName = explicitDatabase;
  } else if (autoDetected.length === 1) {
    targetClassName = autoDetected[0].className;
  } else if (autoDetected.length > 1) {
    const names = autoDetected.map((p) => p.className).join(', ');
    console.warn(
      `[@goodie-ts/kysely] Multiple Kysely providers detected: ${names}. ` +
        "Use createKyselyPlugin({ database: 'ClassName' }) to disambiguate. " +
        'TransactionManager will require manual configure().',
    );
    return [];
  } else {
    // Zero providers — no auto-wiring
    return [];
  }

  // Find the bean matching the target class name
  const databaseBean = beans.find(
    (b) =>
      b.tokenRef.kind === 'class' && b.tokenRef.className === targetClassName,
  );

  if (databaseBean && databaseBean.tokenRef.kind === 'class') {
    return [
      {
        tokenRef: {
          kind: 'class',
          className: databaseBean.tokenRef.className,
          importPath: databaseBean.tokenRef.importPath,
        },
        optional: false,
        collection: false,
        sourceLocation: {
          filePath: '@goodie-ts/kysely',
          line: 0,
          column: 0,
        },
      },
    ];
  }

  console.warn(
    `[@goodie-ts/kysely] Database class '${targetClassName}' not found in beans. ` +
      'TransactionManager will require manual configure().',
  );
  return [];
}
