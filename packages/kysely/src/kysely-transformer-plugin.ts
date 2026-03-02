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
 * **Auto-detection:** The plugin scans decorated classes for properties typed
 * as `Kysely<...>` and auto-wires the owning class as a TransactionManager
 * and/or MigrationRunner constructor dependency. Use `options.database` to
 * override when multiple classes expose a `Kysely` property.
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

  /** @Migration decorated classes discovered during visitClass. */
  const migrationClasses: MigrationClassInfo[] = [];

  return {
    name: 'kysely',

    visitClass(ctx: ClassVisitorContext): void {
      // Detect Kysely<...> properties for auto-wiring
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

      // Resolve the database bean for auto-wiring.
      // Priority: explicit `database` option > auto-detected Kysely provider.
      const kyselyProviderDep = resolveKyselyProvider(
        beans,
        options?.database,
        kyselyProviders,
      );

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

          // Synthetic bean per @Migration class
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
          }

          // MigrationRunner: eager singleton, depends on KyselyProvider + all migration beans
          syntheticBeans.push({
            tokenRef: {
              kind: 'class',
              className: 'MigrationRunner',
              importPath: '@goodie-ts/kysely',
            },
            scope: 'singleton',
            eager: true,
            name: undefined,
            constructorDeps: [
              kyselyProviderDep[0],
              ...migrationClasses.map((m) => ({
                tokenRef: {
                  kind: 'class' as const,
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
              })),
            ],
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
