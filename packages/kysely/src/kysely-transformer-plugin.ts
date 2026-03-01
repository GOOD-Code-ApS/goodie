import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

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
 * Note: The plugin adds a synthetic TransactionManager bean. The user must
 * call `transactionManager.configure(kysely)` during startup (e.g. in a
 * `@PostConstruct` method) to provide the Kysely instance.
 */
export function createKyselyPlugin(): TransformerPlugin {
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

      // Add synthetic TransactionManager bean (no deps).
      // The user must call transactionManager.configure(kysely) during startup.
      const transactionManagerBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'TransactionManager',
          importPath: '@goodie-ts/kysely',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
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

      return {
        imports: [
          "import { TransactionManager, TransactionalInterceptor } from '@goodie-ts/kysely'",
          "import { buildInterceptorChain } from '@goodie-ts/aop'",
        ],
      };
    },
  };
}
