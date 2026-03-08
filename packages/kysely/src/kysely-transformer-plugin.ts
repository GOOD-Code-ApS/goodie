import type {
  ClassVisitorContext,
  CodegenContribution,
  IRBeanDefinition,
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

/** Internal tracking of @Migration decorated classes found during class visiting. */
interface MigrationClassInfo {
  className: string;
  filePath: string;
  migrationName: string;
}

/**
 * Create the Kysely transformer plugin.
 *
 * Scans @Transactional decorators on methods and wires
 * TransactionalInterceptor as an AOP interceptor dependency at compile time.
 *
 * Scans @Migration decorated classes and wires a MigrationRunner that
 * executes all migrations at startup via @PostConstruct.
 *
 * Wires TransactionManager and MigrationRunner using `KyselyDatabase` from
 * library beans — no manual `database` option needed.
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

  /** @Migration decorated classes discovered during visitClass. */
  const migrationClasses: MigrationClassInfo[] = [];

  return {
    name: 'kysely',

    visitClass(ctx: ClassVisitorContext): void {
      // Detect @Migration('name') class decorator
      for (const decorator of ctx.classDeclaration.getDecorators()) {
        if (decorator.getName() !== 'Migration') continue;
        const args = decorator.getArguments();
        const name = args[0]?.getText().replace(/['"]/g, '') ?? ctx.className;
        migrationClasses.push({
          className: ctx.className,
          filePath: ctx.filePath,
          migrationName: name,
        });
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
      const syntheticBeans: IRBeanDefinition[] = [];

      // --- @Transactional interception ---
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

      const hasMigrations = migrationClasses.length > 0;

      if (!needsInterceptor && !hasMigrations) return beans;

      // Check if any KyselyDatabase subclass exists (via baseTokenRefs).
      // Wire deps using the abstract KyselyDatabase token — runtime resolves
      // the concrete impl via baseTokenRefs after conditional filtering.
      const hasKyselyDatabase = beans.some(
        (b) =>
          b.tokenRef.kind === 'class' &&
          (b.baseTokenRefs?.some(
            (ref) =>
              ref.className === 'KyselyDatabase' &&
              ref.importPath === '@goodie-ts/kysely',
          ) ||
            (b.tokenRef.className === 'KyselyDatabase' &&
              b.tokenRef.importPath === '@goodie-ts/kysely')),
      );

      const kyselyDatabaseTokenRef: IRBeanDefinition['tokenRef'] = {
        kind: 'class',
        className: 'KyselyDatabase',
        importPath: '@goodie-ts/kysely',
      };

      const kyselyProviderDep: IRBeanDefinition['constructorDeps'] =
        hasKyselyDatabase
          ? [
              {
                tokenRef: kyselyDatabaseTokenRef,
                optional: false,
                collection: false,
                sourceLocation: {
                  filePath: '@goodie-ts/kysely',
                  line: 0,
                  column: 0,
                },
              },
            ]
          : [];

      // --- Transactional synthetic beans ---
      if (needsInterceptor) {
        syntheticBeans.push({
          tokenRef: {
            kind: 'class',
            className: 'TransactionManager',
            importPath: '@goodie-ts/kysely',
          },
          scope: 'singleton',
          eager: false,
          name: undefined,
          constructorDeps: kyselyProviderDep,
          fieldDeps: [],
          factoryKind: 'constructor',
          providesSource: undefined,
          metadata: {},
          sourceLocation: {
            filePath: '@goodie-ts/kysely',
            line: 0,
            column: 0,
          },
        });

        syntheticBeans.push({
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
        });
      }

      // --- @Migration synthetic beans ---
      if (hasMigrations) {
        if (kyselyProviderDep.length === 0) {
          console.warn(
            '[@goodie-ts/kysely] @Migration classes found but no Kysely provider detected. ' +
              'MigrationRunner will not be created.',
          );
        } else {
          // Sort migrations by name for deterministic execution order
          migrationClasses.sort((a, b) =>
            a.migrationName.localeCompare(b.migrationName),
          );

          // Synthetic bean per @Migration class (no baseTokenRefs — wired as individual deps)
          const migrationDeps: IRBeanDefinition['constructorDeps'] = [];
          for (const m of migrationClasses) {
            syntheticBeans.push({
              tokenRef: {
                kind: 'class',
                className: m.className,
                importPath: m.filePath,
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
                filePath: m.filePath,
                line: 0,
                column: 0,
              },
            });

            migrationDeps.push({
              tokenRef: {
                kind: 'class',
                className: m.className,
                importPath: m.filePath,
              },
              optional: false,
              collection: false,
              sourceLocation: {
                filePath: '@goodie-ts/kysely',
                line: 0,
                column: 0,
              },
            });
          }

          // MigrationRunner: eager singleton, depends on KyselyProvider + individual migration deps
          syntheticBeans.push({
            tokenRef: {
              kind: 'class',
              className: 'MigrationRunner',
              importPath: '@goodie-ts/kysely',
            },
            scope: 'singleton',
            eager: true,
            name: undefined,
            constructorDeps: [kyselyProviderDep[0], ...migrationDeps],
            fieldDeps: [],
            factoryKind: 'constructor',
            providesSource: undefined,
            metadata: { postConstructMethods: ['migrate'] },
            sourceLocation: {
              filePath: '@goodie-ts/kysely',
              line: 0,
              column: 0,
            },
          });
        }
      }

      return [...beans, ...syntheticBeans];
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
        imports: ["import { buildInterceptorChain } from '@goodie-ts/core'"],
      };
    },
  };
}

export default createKyselyPlugin;
