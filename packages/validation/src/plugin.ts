import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Collected param type info for a validated method.
 */
interface ValidatedMethodParam {
  /** Bean class name (e.g. 'TodoController'). */
  beanClassName: string;
  /** Absolute file path of the bean class. */
  beanFilePath: string;
  /** Method name (e.g. 'create'). */
  methodName: string;
  /** Body type class name (e.g. 'CreateTodoDto'). */
  bodyTypeClassName: string;
  /** Absolute file path of the body type class. */
  bodyTypeFilePath: string;
  /** Index of the body parameter in the method's argument list. */
  paramIndex: number;
}

/**
 * Validation transformer plugin.
 *
 * Scans `@Validated` methods for body parameters and generates
 * `MetadataRegistry.INSTANCE.registerMethodParams(...)` calls so that
 * `ValidationInterceptor` knows which types to validate at runtime.
 *
 * Detects direct body parameters (Micronaut-style) — uses the parameter's
 * class type and tracks its position in the argument list.
 *
 * Auto-discovered via `"goodie": { "plugin\": \"dist/plugin.js\" }` in package.json.
 */
export default function createValidationPlugin(): TransformerPlugin {
  const validatedMethods: ValidatedMethodParam[] = [];

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
            validatedMethods.push({
              beanClassName: ctx.className,
              beanFilePath: ctx.filePath,
              methodName: ctx.methodName,
              bodyTypeClassName: symbol.getName(),
              bodyTypeFilePath: declarations[0].getSourceFile().getFilePath(),
              paramIndex: i,
            });
            return;
          }
        }
      }
    },

    codegen(_beans: IRBeanDefinition[]): CodegenContribution {
      if (validatedMethods.length === 0) return {};

      const imports: string[] = [
        "import { MetadataRegistry } from '@goodie-ts/core'",
      ];
      const code: string[] = [];

      // Collect unique imports needed
      const importedBeans = new Set<string>();
      const importedTypes = new Set<string>();

      for (const m of validatedMethods) {
        const beanKey = `${m.beanClassName}:${m.beanFilePath}`;
        if (!importedBeans.has(beanKey)) {
          imports.push(
            `import { ${m.beanClassName} } from '${m.beanFilePath}'`,
          );
          importedBeans.add(beanKey);
        }

        const typeKey = `${m.bodyTypeClassName}:${m.bodyTypeFilePath}`;
        if (!importedTypes.has(typeKey)) {
          imports.push(
            `import { ${m.bodyTypeClassName} } from '${m.bodyTypeFilePath}'`,
          );
          importedTypes.add(typeKey);
        }
      }

      // Group by bean class + method to build the paramTypes array
      const methodMap = new Map<string, ValidatedMethodParam>();
      for (const m of validatedMethods) {
        methodMap.set(`${m.beanClassName}:${m.methodName}`, m);
      }

      for (const m of methodMap.values()) {
        code.push(
          `MetadataRegistry.INSTANCE.registerMethodParams(${m.beanClassName}, '${m.methodName}', [${m.bodyTypeClassName}], ${m.paramIndex})`,
        );
      }

      return { imports, code };
    },
  };
}
