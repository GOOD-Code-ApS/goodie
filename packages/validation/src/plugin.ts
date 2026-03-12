import type {
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Validation transformer plugin.
 *
 * Scans `@Validated` methods for body parameters and stores
 * `validatedMethodParams` metadata on the bean so that core codegen
 * generates `MetadataRegistry.INSTANCE.registerMethodParams(...)` calls.
 * `ValidationInterceptor` reads these at runtime to know which types to validate.
 *
 * Detects direct body parameters (Micronaut-style) — uses the parameter's
 * class type and tracks its position in the argument list.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createValidationPlugin(): TransformerPlugin {
  return {
    name: 'validation',

    visitMethod(ctx: MethodVisitorContext): void {
      const hasValidated = ctx.decorators.some((d) => d.name === 'Validated');
      if (!hasValidated) return;

      const params = ctx.methodDeclaration.getParameters();
      if (params.length === 0) return;

      // Find a non-primitive class parameter (body param)
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const paramType = param.getType();
        const paramTypeName =
          param.getTypeNode()?.getText() ?? paramType.getText();

        // Skip primitives, primitive arrays, and HttpContext
        if (['string', 'number', 'boolean'].includes(paramTypeName)) continue;
        if (['string[]', 'number[]', 'boolean[]'].includes(paramTypeName))
          continue;
        if (paramTypeName === 'HttpContext') continue;

        // This is a class-typed param → body parameter
        const symbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
        if (symbol) {
          const declarations = symbol.getDeclarations();
          if (declarations.length > 0) {
            const existing = (ctx.classMetadata.validatedMethodParams ??
              []) as Array<{
              methodName: string;
              bodyTypeClassName: string;
              bodyTypeImportPath: string;
              paramIndex: number;
            }>;
            existing.push({
              methodName: ctx.methodName,
              bodyTypeClassName: symbol.getName(),
              bodyTypeImportPath: declarations[0].getSourceFile().getFilePath(),
              paramIndex: i,
            });
            ctx.classMetadata.validatedMethodParams = existing;
            return;
          }
        }
      }
    },
  };
}
