import type {
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Validation transformer plugin.
 *
 * Scans `@Validated` methods for class-typed parameters and stores
 * `validatedMethodParams` metadata on the bean so that core codegen
 * generates `MetadataRegistry.INSTANCE.registerMethodParam(...)` calls.
 * `ValidationInterceptor` reads these at runtime to know which arguments to validate.
 *
 * All class-typed parameters are registered — primitives, primitive arrays,
 * and `HttpContext` are skipped. This supports non-contiguous class params
 * (e.g. `process(id: string, auth: AuthToken, name: string, body: UpdateDto)`).
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

        // Class-typed param → register for validation
        const symbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
        if (!symbol) continue;
        const declarations = symbol.getDeclarations();
        if (declarations.length === 0) continue;

        const existing = (ctx.classMetadata.validatedMethodParams ??
          []) as Array<{
          methodName: string;
          typeClassName: string;
          typeImportPath: string;
          paramIndex: number;
        }>;
        existing.push({
          methodName: ctx.methodName,
          typeClassName: symbol.getName(),
          typeImportPath: declarations[0].getSourceFile().getFilePath(),
          paramIndex: i,
        });
        ctx.classMetadata.validatedMethodParams = existing;
      }
    },
  };
}
