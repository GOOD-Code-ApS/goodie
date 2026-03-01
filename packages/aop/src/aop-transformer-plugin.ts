import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import type { InterceptedMethodDescriptor } from './types.js';

/** Internal tracking of AOP annotations found during method visiting. */
interface AopMethodInfo {
  methodName: string;
  interceptorClassName: string;
  type: 'around' | 'before' | 'after';
  order: number;
}

const AOP_DECORATOR_NAMES = ['Around', 'Before', 'After'] as const;

/**
 * Create the AOP transformer plugin.
 * Scans @Around/@Before/@After decorators on methods and generates
 * metadata for the AopPostProcessor.
 */
export function createAopPlugin(): TransformerPlugin {
  // Map className -> list of AOP method info
  const classAopInfo = new Map<string, AopMethodInfo[]>();

  return {
    name: 'aop',

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        const decoratorName = decorator.getName();
        if (
          !AOP_DECORATOR_NAMES.includes(
            decoratorName as (typeof AOP_DECORATOR_NAMES)[number],
          )
        )
          continue;

        const args = decorator.getArguments();
        if (args.length === 0) continue;

        const interceptorClassName = args[0].getText();
        let order = 0;

        // Check for options object with order
        if (args.length > 1) {
          const optArg = args[1];
          const text = optArg.getText();
          const orderMatch = text.match(/order\s*:\s*(\d+)/);
          if (orderMatch) {
            order = Number.parseInt(orderMatch[1], 10);
          }
        }

        const existing = classAopInfo.get(ctx.className) ?? [];
        existing.push({
          methodName: ctx.methodName,
          interceptorClassName,
          type: decoratorName.toLowerCase() as 'around' | 'before' | 'after',
          order,
        });
        classAopInfo.set(ctx.className, existing);
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Populate metadata.interceptedMethods on beans that have AOP decorators
      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        const aopInfos = classAopInfo.get(className);
        if (!aopInfos || aopInfos.length === 0) continue;

        // Group by method name and sort by order
        const methodMap = new Map<string, AopMethodInfo[]>();
        for (const info of aopInfos) {
          const existing = methodMap.get(info.methodName) ?? [];
          existing.push(info);
          methodMap.set(info.methodName, existing);
        }

        const interceptedMethods: InterceptedMethodDescriptor[] = [];
        for (const [methodName, infos] of methodMap) {
          const sorted = infos.sort((a, b) => a.order - b.order);
          interceptedMethods.push({
            methodName,
            interceptorTokenRefs: sorted.map((info) => ({
              className: info.interceptorClassName,
              importPath: '', // resolved at runtime via DI container
            })),
            order: sorted[0].order,
          });
        }

        bean.metadata.interceptedMethods = interceptedMethods;
      }

      return beans;
    },

    beforeCodegen(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Check if any bean has intercepted methods
      const hasAop = beans.some(
        (b) =>
          b.metadata.interceptedMethods &&
          (b.metadata.interceptedMethods as unknown[]).length > 0,
      );

      if (!hasAop) return beans;

      // Inject synthetic AopPostProcessor bean definition
      const aopPostProcessorBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'AopPostProcessor',
          importPath: '@goodie-ts/aop',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { isBeanPostProcessor: true },
        sourceLocation: { filePath: '@goodie-ts/aop', line: 0, column: 0 },
      };

      return [aopPostProcessorBean, ...beans];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasAop = beans.some(
        (b) =>
          b.metadata.interceptedMethods &&
          (b.metadata.interceptedMethods as unknown[]).length > 0,
      );

      if (!hasAop) return {};

      return {
        imports: ["import { AopPostProcessor } from '@goodie-ts/aop'"],
      };
    },
  };
}
