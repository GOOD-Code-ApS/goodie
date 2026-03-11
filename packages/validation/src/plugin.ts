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
}

/**
 * Validation transformer plugin.
 *
 * Scans `@Validated` methods for `Request<T>` parameters and generates
 * `MetadataRegistry.INSTANCE.registerMethodParams(...)` calls so that
 * `ValidationInterceptor` knows which types to validate at runtime.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
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

      const firstParam = params[0];
      const paramType = firstParam.getType();
      const typeArgs = paramType.getTypeArguments();
      if (typeArgs.length === 0) return;

      // Extract the body type T from Request<T>
      const bodyType = typeArgs[0];
      const symbol = bodyType.getSymbol() ?? bodyType.getAliasSymbol();
      if (!symbol) return;

      const declarations = symbol.getDeclarations();
      if (declarations.length === 0) return;

      const sourceFile = declarations[0].getSourceFile();

      validatedMethods.push({
        beanClassName: ctx.className,
        beanFilePath: ctx.filePath,
        methodName: ctx.methodName,
        bodyTypeClassName: symbol.getName(),
        bodyTypeFilePath: sourceFile.getFilePath(),
      });
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
          `MetadataRegistry.INSTANCE.registerMethodParams(${m.beanClassName}, '${m.methodName}', [${m.bodyTypeClassName}])`,
        );
      }

      return { imports, code };
    },
  };
}
