import type {
  ClassVisitorContext,
  IRComponentDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import { Node, SyntaxKind } from 'ts-morph';

/**
 * Security transformer plugin.
 *
 * Scan phase: detects @Secured on classes and @Anonymous on methods.
 * afterResolve: marks anonymous methods in the AOP interceptor metadata
 * so the SecurityInterceptor can skip auth for those methods.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createSecurityPlugin(): TransformerPlugin {
  return {
    name: 'security',

    visitClass(ctx: ClassVisitorContext): void {
      const hasSecured = ctx.decorators.some((d) => d.name === 'Secured');
      if (!hasSecured) return;

      // Extract roles from AST using ts-morph node traversal
      const securedDec = ctx.classDeclaration
        .getDecorators()
        .find((d) => d.getName() === 'Secured');
      const classRoles = securedDec
        ? extractRolesFromDecorator(securedDec.getArguments())
        : [];

      ctx.metadata.security = {
        classRoles,
        anonymousMethods: [] as string[],
      };
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const isAnonymous = ctx.decorators.some((d) => d.name === 'Anonymous');
      if (isAnonymous) {
        const security = (ctx.classMetadata.security ?? {
          classRoles: [],
          anonymousMethods: [],
        }) as { classRoles: string[]; anonymousMethods: string[] };
        security.anonymousMethods.push(ctx.methodName);
        ctx.classMetadata.security = security;
      }
    },

    afterResolve(components: IRComponentDefinition[]): IRComponentDefinition[] {
      // Mark anonymous methods in the AOP interceptor metadata so
      // SecurityInterceptor can skip auth for @Anonymous methods.
      for (const component of components) {
        const security = component.metadata.security as
          | { classRoles: string[]; anonymousMethods: string[] }
          | undefined;
        if (!security || security.anonymousMethods.length === 0) continue;

        const interceptedMethods = component.metadata.interceptedMethods as
          | Array<{
              methodName: string;
              interceptors: Array<{
                className: string;
                importPath: string;
                adviceType: string;
                order: number;
                metadata?: Record<string, unknown>;
              }>;
            }>
          | undefined;
        if (!interceptedMethods) continue;

        const anonymousSet = new Set(security.anonymousMethods);
        for (const method of interceptedMethods) {
          if (!anonymousSet.has(method.methodName)) continue;
          for (const interceptor of method.interceptors) {
            if (interceptor.className === 'SecurityInterceptor') {
              interceptor.metadata = {
                ...interceptor.metadata,
                anonymous: true,
              };
            }
          }
        }
      }

      return components;
    },
  };
}

/**
 * Extract roles from decorator arguments using ts-morph AST traversal.
 * Handles @Secured('ADMIN') and @Secured(['ADMIN', 'USER']).
 */
function extractRolesFromDecorator(args: Node[]): string[] {
  if (args.length === 0) return [];
  const arg = args[0];

  // @Secured('ADMIN') — single string literal
  if (Node.isStringLiteral(arg)) {
    return [arg.getLiteralValue()];
  }

  // @Secured(['ADMIN', 'USER']) — array literal
  if (Node.isArrayLiteralExpression(arg)) {
    return arg
      .getElements()
      .filter((el): el is import('ts-morph').StringLiteral =>
        Node.isStringLiteral(el),
      )
      .map((el) => el.getLiteralValue());
  }

  return [];
}
