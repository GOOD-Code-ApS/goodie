import type {
  InterceptedMethodDescriptor,
  InterceptorRef,
} from '@goodie-ts/core';
import type { IRComponentDefinition } from './ir.js';
import type { MethodVisitorContext, TransformerPlugin } from './options.js';

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
 * Built-in AOP transformer plugin.
 *
 * Scans @Around/@Before/@After decorators on methods. At compile time,
 * interceptors become normal component dependencies and the codegen generates
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

    afterResolve(components: IRComponentDefinition[]): IRComponentDefinition[] {
      for (const component of components) {
        const className =
          component.tokenRef.kind === 'class'
            ? component.tokenRef.className
            : undefined;
        if (!className) continue;

        // Match by importPath:className (consistent with plugin metadata keying)
        const key = `${component.tokenRef.importPath}:${className}`;
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

        component.metadata.interceptedMethods = interceptedMethods;
      }

      return components;
    },
  };
}
