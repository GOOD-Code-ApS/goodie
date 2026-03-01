import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Internal tracking of resilience annotations found during method visiting. */
interface ResilienceMethodInfo {
  methodName: string;
  kind: 'retry' | 'circuitBreaker' | 'timeout';
  metadata: Record<string, unknown>;
}

const DECORATOR_MAP: Record<string, 'retry' | 'circuitBreaker' | 'timeout'> = {
  Retryable: 'retry',
  CircuitBreaker: 'circuitBreaker',
  Timeout: 'timeout',
};

/** Order values — outermost (lowest) runs first: Timeout → CircuitBreaker → Retry */
const ORDER_MAP: Record<string, number> = {
  timeout: -30, // Outermost — enforces deadline
  circuitBreaker: -20, // Middle — rejects if circuit open
  retry: -10, // Innermost — retries close to the method
};

const INTERCEPTOR_CLASS_MAP: Record<string, string> = {
  retry: 'RetryInterceptor',
  circuitBreaker: 'CircuitBreakerInterceptor',
  timeout: 'TimeoutInterceptor',
};

/**
 * Create the resilience transformer plugin.
 *
 * Scans @Retryable, @CircuitBreaker, and @Timeout decorators on methods
 * and wires the appropriate interceptors as AOP dependencies at compile time.
 */
export function createResiliencePlugin(): TransformerPlugin {
  const classResilienceInfo = new Map<string, ResilienceMethodInfo[]>();

  return {
    name: 'resilience',

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        const decoratorName = decorator.getName();
        const kind = DECORATOR_MAP[decoratorName];
        if (!kind) continue;

        const args = decorator.getArguments();
        const metadata = parseMetadata(kind, args);

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classResilienceInfo.get(key) ?? [];
        existing.push({
          methodName: ctx.methodName,
          kind,
          metadata,
        });
        classResilienceInfo.set(key, existing);
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      const usedInterceptors = new Set<string>();

      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        const key = `${bean.tokenRef.importPath}:${className}`;
        const infos = classResilienceInfo.get(key);
        if (!infos || infos.length === 0) continue;

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
          const interceptorClassName = INTERCEPTOR_CLASS_MAP[info.kind];
          usedInterceptors.add(interceptorClassName);

          const methodEntry = existing.find(
            (m) => m.methodName === info.methodName,
          );

          const interceptorRef = {
            className: interceptorClassName,
            importPath: '@goodie-ts/resilience',
            adviceType: 'around' as const,
            order: ORDER_MAP[info.kind],
            metadata: info.metadata,
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

      if (usedInterceptors.size === 0) return beans;

      // Add synthetic beans for each used interceptor
      const syntheticBeans: IRBeanDefinition[] = [];
      for (const interceptorClassName of usedInterceptors) {
        syntheticBeans.push({
          tokenRef: {
            kind: 'class',
            className: interceptorClassName,
            importPath: '@goodie-ts/resilience',
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
            filePath: '@goodie-ts/resilience',
            line: 0,
            column: 0,
          },
        });
      }

      return [...beans, ...syntheticBeans];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const usedClasses = new Set<string>();

      for (const bean of beans) {
        const methods = bean.metadata.interceptedMethods as
          | Array<{
              interceptors: Array<{ className: string; importPath: string }>;
            }>
          | undefined;
        if (!methods) continue;

        for (const m of methods) {
          for (const i of m.interceptors) {
            if (i.importPath === '@goodie-ts/resilience') {
              usedClasses.add(i.className);
            }
          }
        }
      }

      if (usedClasses.size === 0) return {};

      const classNames = [...usedClasses].sort().join(', ');
      return {
        imports: [
          `import { ${classNames} } from '@goodie-ts/resilience'`,
          "import { buildInterceptorChain } from '@goodie-ts/aop'",
        ],
      };
    },
  };
}

function parseMetadata(
  kind: 'retry' | 'circuitBreaker' | 'timeout',
  args: ReturnType<
    ReturnType<
      import('ts-morph').MethodDeclaration['getDecorators']
    >[number]['getArguments']
  >,
): Record<string, unknown> {
  switch (kind) {
    case 'retry': {
      const defaults = { maxAttempts: 3, delay: 1000, multiplier: 1 };
      if (args.length === 0) return defaults;
      const text = args[0].getText();
      const maxMatch = text.match(/maxAttempts\s*:\s*(\d+)/);
      const delayMatch = text.match(/delay\s*:\s*(\d+)/);
      const multMatch = text.match(/multiplier\s*:\s*([\d.]+)/);
      return {
        maxAttempts: maxMatch
          ? Number.parseInt(maxMatch[1], 10)
          : defaults.maxAttempts,
        delay: delayMatch ? Number.parseInt(delayMatch[1], 10) : defaults.delay,
        multiplier: multMatch
          ? Number.parseFloat(multMatch[1])
          : defaults.multiplier,
      };
    }
    case 'circuitBreaker': {
      const defaults = {
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenAttempts: 1,
      };
      if (args.length === 0) return defaults;
      const text = args[0].getText();
      const threshMatch = text.match(/failureThreshold\s*:\s*(\d+)/);
      const resetMatch = text.match(/resetTimeout\s*:\s*(\d+)/);
      const halfMatch = text.match(/halfOpenAttempts\s*:\s*(\d+)/);
      return {
        failureThreshold: threshMatch
          ? Number.parseInt(threshMatch[1], 10)
          : defaults.failureThreshold,
        resetTimeout: resetMatch
          ? Number.parseInt(resetMatch[1], 10)
          : defaults.resetTimeout,
        halfOpenAttempts: halfMatch
          ? Number.parseInt(halfMatch[1], 10)
          : defaults.halfOpenAttempts,
      };
    }
    case 'timeout': {
      if (args.length === 0) return { duration: 5000 };
      const text = args[0].getText();
      const num = Number.parseInt(text, 10);
      return { duration: Number.isNaN(num) ? 5000 : num };
    }
  }
}
