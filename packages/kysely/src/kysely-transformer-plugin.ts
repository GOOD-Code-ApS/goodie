import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Options for the Kysely transformer plugin. */
export interface KyselyPluginOptions {
  /**
   * Class name of the bean that provides a `.kysely` property (e.g. `'Database'`).
   * When set, TransactionManager is auto-wired with this bean as a constructor
   * dependency — no manual `configure()` call needed.
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
 * **Limitation:** Propagation is detected via AST text matching
 * (`text.includes('REQUIRES_NEW')`). Only string literal values in the
 * decorator argument are supported — const references or computed values
 * will fall back to `'REQUIRED'` silently.
 *
 * @param options.database - Class name of the bean providing `.kysely`.
 *   When set, TransactionManager is auto-wired with this bean as a
 *   constructor dependency, eliminating the need for manual `configure()`.
 */
export function createKyselyPlugin(
  options?: KyselyPluginOptions,
): TransformerPlugin {
  const classTransactionalInfo = new Map<string, TransactionalMethodInfo[]>();

  return {
    name: 'kysely',

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

      // Resolve the database bean for auto-wiring TransactionManager
      const databaseClassName = options?.database;
      let databaseDeps: IRBeanDefinition['constructorDeps'] = [];

      if (databaseClassName) {
        const databaseBean = beans.find(
          (b) =>
            b.tokenRef.kind === 'class' &&
            b.tokenRef.className === databaseClassName,
        );

        if (databaseBean && databaseBean.tokenRef.kind === 'class') {
          databaseDeps = [
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
        } else {
          console.warn(
            `[@goodie-ts/kysely] database option '${databaseClassName}' not found in beans. ` +
              'TransactionManager will require manual configure().',
          );
        }
      }

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
