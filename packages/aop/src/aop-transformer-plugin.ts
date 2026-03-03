import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import type { InterceptedMethodDescriptor, InterceptorRef } from './types.js';

/** Internal tracking of AOP annotations found during method visiting. */
interface AopMethodInfo {
  methodName: string;
  interceptorClassName: string;
  interceptorImportPath: string;
  adviceType: 'around' | 'before' | 'after';
  order: number;
}

const AOP_DECORATOR_NAMES = ['Around', 'Before', 'After'] as const;

/**
 * Create the AOP transformer plugin.
 *
 * Scans @Around/@Before/@After decorators on methods. At compile time,
 * interceptors become normal bean dependencies and the codegen generates
 * `buildInterceptorChain()` calls inside factory functions — no runtime
 * post-processor needed.
 */
export function createAopPlugin(): TransformerPlugin {
  // Map (filePath:className) -> list of AOP method info
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

        const interceptorArg = args[0];

        // Resolve the interceptor class via ts-morph type system
        let className = interceptorArg.getText();
        let importPath = '';

        const interceptorType = interceptorArg.getType();
        const symbol = interceptorType.getSymbol();
        if (symbol) {
          className = symbol.getName();
          const decls = symbol.getDeclarations();
          if (decls.length > 0) {
            importPath = decls[0].getSourceFile().getFilePath();
          }
        }

        // Parse order from options argument
        let order = 0;
        if (args.length > 1) {
          const text = args[1].getText();
          const orderMatch = text.match(/order\s*:\s*(\d+)/);
          if (orderMatch) {
            order = Number.parseInt(orderMatch[1], 10);
          }
        }

        // Key by filePath:className to avoid collisions
        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classAopInfo.get(key) ?? [];
        existing.push({
          methodName: ctx.methodName,
          interceptorClassName: className,
          interceptorImportPath: importPath,
          adviceType: decoratorName.toLowerCase() as
            | 'around'
            | 'before'
            | 'after',
          order,
        });
        classAopInfo.set(key, existing);
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        // Match by importPath:className (consistent with plugin metadata keying)
        const key = `${bean.tokenRef.importPath}:${className}`;
        const aopInfos = classAopInfo.get(key);
        if (!aopInfos || aopInfos.length === 0) continue;

        // Group by method name
        const methodMap = new Map<string, AopMethodInfo[]>();
        for (const info of aopInfos) {
          const list = methodMap.get(info.methodName) ?? [];
          list.push(info);
          methodMap.set(info.methodName, list);
        }

        // Build InterceptedMethodDescriptor[] and collect unique interceptors
        const interceptedMethods: InterceptedMethodDescriptor[] = [];

        for (const [methodName, infos] of methodMap) {
          const sorted = infos.sort((a, b) => a.order - b.order);
          interceptedMethods.push({
            methodName,
            interceptors: sorted.map(
              (info): InterceptorRef => ({
                className: info.interceptorClassName,
                importPath: info.interceptorImportPath,
                adviceType: info.adviceType,
                order: info.order,
              }),
            ),
          });
        }

        bean.metadata.interceptedMethods = interceptedMethods;
      }

      return beans;
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasAop = beans.some(
        (b) =>
          b.metadata.interceptedMethods &&
          (b.metadata.interceptedMethods as unknown[]).length > 0,
      );

      if (!hasAop) return {};

      // Check which wrapper imports are needed
      const allMethods = beans.flatMap(
        (b) =>
          (b.metadata.interceptedMethods as InterceptedMethodDescriptor[]) ??
          [],
      );
      const allInterceptors = allMethods.flatMap((m) => m.interceptors);
      const hasBefore = allInterceptors.some((i) => i.adviceType === 'before');
      const hasAfter = allInterceptors.some((i) => i.adviceType === 'after');

      const importSymbols = ['buildInterceptorChain'];
      if (hasBefore) importSymbols.push('wrapBeforeAdvice');
      if (hasAfter) importSymbols.push('wrapAfterAdvice');

      return {
        imports: [
          `import { ${importSymbols.join(', ')} } from '@goodie-ts/aop'`,
        ],
      };
    },
  };
}
