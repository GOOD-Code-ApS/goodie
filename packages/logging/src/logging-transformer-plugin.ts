import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Internal tracking of @Log annotations found during method visiting. */
interface LogMethodInfo {
  methodName: string;
  level: 'debug' | 'info';
}

/**
 * Create the logging transformer plugin.
 *
 * Scans @Log() decorators on methods and wires LoggingInterceptor as an AOP
 * interceptor dependency at compile time. The interceptor is added as a synthetic
 * bean so users don't need to register it manually.
 *
 * **Custom LoggerFactory:** The synthetic `LoggingInterceptor` bean is created with
 * zero constructor deps (uses the default `ConsoleLogger`). To use a custom logger
 * (pino, winston, etc.), register your own `LoggingInterceptor` bean with a
 * `LoggerFactory` constructor argument — the container will use it instead of the
 * synthetic bean due to duplicate resolution.
 */
export function createLoggingPlugin(): TransformerPlugin {
  const classLogInfo = new Map<string, LogMethodInfo[]>();

  return {
    name: 'logging',

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'Log') continue;

        // Parse level from decorator arguments: @Log({ level: 'debug' })
        let level: 'debug' | 'info' = 'info';
        const args = decorator.getArguments();
        if (args.length > 0) {
          const text = args[0].getText();
          const levelMatch = text.match(/level\s*:\s*['"](\w+)['"]/);
          if (levelMatch && levelMatch[1] === 'debug') {
            level = 'debug';
          }
        }

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classLogInfo.get(key) ?? [];
        existing.push({ methodName: ctx.methodName, level });
        classLogInfo.set(key, existing);
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      let needsInterceptor = false;

      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        const key = `${bean.tokenRef.importPath}:${className}`;
        const logInfos = classLogInfo.get(key);
        if (!logInfos || logInfos.length === 0) continue;

        needsInterceptor = true;

        // Build interceptedMethods entries — append to existing (don't overwrite)
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

        for (const info of logInfos) {
          // Check if method already has interceptors from another plugin
          const methodEntry = existing.find(
            (m) => m.methodName === info.methodName,
          );

          const interceptorRef = {
            className: 'LoggingInterceptor',
            importPath: '@goodie-ts/logging',
            adviceType: 'around' as const,
            order: -100, // Logging runs outermost (before other interceptors)
            metadata: { level: info.level },
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

      // Synthetic bean must be in afterResolve (not beforeCodegen) because
      // the graph builder validates that interceptor references have matching
      // bean providers. beforeCodegen runs after graph building.
      const syntheticBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'LoggingInterceptor',
          importPath: '@goodie-ts/logging',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@goodie-ts/logging', line: 0, column: 0 },
      };

      return [...beans, syntheticBean];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasLogging = beans.some((b) => {
        const methods = b.metadata.interceptedMethods as
          | Array<{
              interceptors: Array<{ className: string }>;
            }>
          | undefined;
        return methods?.some((m) =>
          m.interceptors.some((i) => i.className === 'LoggingInterceptor'),
        );
      });

      if (!hasLogging) return {};

      return {
        imports: [
          "import { LoggingInterceptor } from '@goodie-ts/logging'",
          "import { buildInterceptorChain } from '@goodie-ts/aop'",
        ],
      };
    },
  };
}
