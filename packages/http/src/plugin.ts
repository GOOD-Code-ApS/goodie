import type {
  ClassVisitorContext,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import {
  extractDecoratorMeta,
  InvalidDecoratorUsageError,
} from '@goodie-ts/transformer';
import type { MethodDeclaration, Type } from 'ts-morph';

import type {
  ControllerMetadata,
  HttpMethod,
  ParamMetadata,
  RouteMetadata,
} from './route-metadata.js';

/** Route decorator names mapped to HTTP methods. */
const ROUTE_DECORATOR_MAP: Record<string, HttpMethod> = {
  Get: 'get',
  Post: 'post',
  Put: 'put',
  Delete: 'delete',
  Patch: 'patch',
};

/** HTTP methods that support a request body. */
const BODY_METHODS = new Set<HttpMethod>(['post', 'put', 'patch']);

/** Primitive types that map to query parameters. */
const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);

/** Decorators handled by the HTTP plugin or framework — not captured as generic metadata. */
const IGNORED_METHOD_DECORATORS = new Set([
  ...Object.keys(ROUTE_DECORATOR_MAP),
  'Status',
  'Validated',
]);

/**
 * HTTP scan-phase transformer plugin.
 *
 * Scans `@Controller` classes and `@Get`/`@Post`/etc. route methods,
 * populating `metadata.httpController` with `ControllerMetadata`.
 *
 * Supports Micronaut-style parameter binding:
 * - `HttpContext` param → read-only request context (headers, cookies, etc.)
 * - Param name matching `:pathVar` in route path → path parameter
 * - Primitive types (`string`, `number`, `boolean`) → query parameter
 * - Primitive array types (`string[]`, `number[]`, `boolean[]`) → multi-valued query parameter
 * - `@Introspected` class type → request body (POST/PUT/PATCH only)
 *
 * Supports `@Status(code)` for default response status code (single-use per method).
 *
 * This is the abstract HTTP layer — no framework-specific codegen.
 * Adapter plugins (e.g. Hono) read `metadata.httpController` and
 * generate framework-specific wiring code.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHttpPlugin(): TransformerPlugin {
  return {
    name: 'http',

    visitClass(ctx: ClassVisitorContext): void {
      const { classDeclaration, metadata } = ctx;
      const decorators = classDeclaration.getDecorators();
      const controllerDec = decorators.find(
        (d) => d.getName() === 'Controller',
      );
      if (!controllerDec) return;

      // Extract basePath from @Controller argument
      let basePath = '/';
      const args = controllerDec.getArguments();
      if (args.length > 0) {
        const argText = args[0].getText();
        if (
          (argText.startsWith("'") && argText.endsWith("'")) ||
          (argText.startsWith('"') && argText.endsWith('"'))
        ) {
          basePath = argText.slice(1, -1);
        }
      }

      ctx.registerComponent({
        scope: 'singleton',
        decoratorName: 'Controller',
      });

      // Initialize controller metadata — routes populated by visitMethod
      metadata.httpController = {
        basePath,
        routes: [],
      } satisfies ControllerMetadata;
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const controller = ctx.classMetadata.httpController as
        | ControllerMetadata
        | undefined;
      if (!controller) return;

      const { methodDeclaration, methodName } = ctx;
      const decorators = methodDeclaration.getDecorators();

      // Find a route decorator (@Get, @Post, etc.)
      let httpMethod: HttpMethod | undefined;
      let path = '/';
      for (const dec of decorators) {
        const matched = ROUTE_DECORATOR_MAP[dec.getName()];
        if (!matched) continue;
        httpMethod = matched;

        const args = dec.getArguments();
        if (args.length > 0) {
          const argText = args[0].getText();
          if (
            (argText.startsWith("'") && argText.endsWith("'")) ||
            (argText.startsWith('"') && argText.endsWith('"'))
          ) {
            path = argText.slice(1, -1);
          }
        }
        break;
      }

      if (!httpMethod) return;

      // Extract @Status decorator (enforce single-use)
      const status = extractStatus(ctx, decorators);

      // Extract path variable names from route path (e.g. '/:id' → ['id'])
      const pathVars = extractPathVariables(path);

      // Classify each method parameter
      const methodParams = methodDeclaration.getParameters();
      const params: ParamMetadata[] = [];
      let hasBodyParam = false;

      for (const param of methodParams) {
        const paramName = param.getName();
        const typeNode = param.getTypeNode();
        const typeName = typeNode?.getText() ?? param.getType().getText();
        const isOptional = param.hasQuestionToken() || param.hasInitializer();

        // Check for HttpContext parameter
        if (typeName === 'HttpContext') {
          params.push({
            name: paramName,
            binding: 'context',
            typeName,
            optional: isOptional,
          });
          continue;
        }

        // Path parameter — name matches a path variable
        if (pathVars.has(paramName)) {
          params.push({
            name: paramName,
            binding: 'path',
            typeName,
            optional: isOptional,
          });
          continue;
        }

        // Primitive type → query parameter
        const baseType = stripUndefined(typeName);
        if (PRIMITIVE_TYPES.has(baseType)) {
          params.push({
            name: paramName,
            binding: 'query',
            typeName: baseType,
            optional: isOptional,
          });
          continue;
        }

        // Primitive array type → multi-valued query parameter
        const arrayElement = extractPrimitiveArrayElement(baseType);
        if (arrayElement) {
          params.push({
            name: paramName,
            binding: 'query',
            typeName: baseType,
            optional: isOptional,
          });
          continue;
        }

        // Non-primitive, non-HttpContext → body parameter
        if (!BODY_METHODS.has(httpMethod)) {
          const sourceFile = methodDeclaration.getSourceFile();
          throw new InvalidDecoratorUsageError(
            httpMethod.charAt(0).toUpperCase() + httpMethod.slice(1),
            `${ctx.className}.${methodName}: parameter "${paramName}" of type "${typeName}" can only be used as a request body on POST/PUT/PATCH methods`,
            {
              filePath: sourceFile.getFilePath(),
              line: param.getStartLineNumber(),
              column: param.getStart() - param.getStartLineNumber() + 1,
            },
          );
        }

        if (hasBodyParam) {
          const sourceFile = methodDeclaration.getSourceFile();
          throw new InvalidDecoratorUsageError(
            httpMethod.charAt(0).toUpperCase() + httpMethod.slice(1),
            `${ctx.className}.${methodName}: multiple body parameters are not allowed. Found second body param "${paramName}"`,
            {
              filePath: sourceFile.getFilePath(),
              line: param.getStartLineNumber(),
              column: param.getStart() - param.getStartLineNumber() + 1,
            },
          );
        }

        hasBodyParam = true;
        params.push({
          name: paramName,
          binding: 'body',
          typeName,
          optional: isOptional,
        });
      }

      const returnType = extractReturnType(methodDeclaration);

      // Capture all non-route decorators as generic metadata
      const methodDecorators = extractDecoratorMeta(
        decorators,
        IGNORED_METHOD_DECORATORS,
      );

      const route: RouteMetadata = {
        methodName,
        httpMethod,
        path,
        status,
        params,
        returnType,
        decorators: methodDecorators,
      };

      controller.routes.push(route);
    },
  };
}

/** Extract @Status decorator value. Throws if multiple @Status found. */
function extractStatus(
  ctx: MethodVisitorContext,
  decorators: {
    getName(): string;
    getArguments(): { getText(): string }[];
    getStartLineNumber(): number;
    getStart(): number;
  }[],
): number {
  const statusDecs = decorators.filter((d) => d.getName() === 'Status');

  if (statusDecs.length === 0) return 200;

  if (statusDecs.length > 1) {
    const sourceFile = ctx.methodDeclaration.getSourceFile();
    const secondDec = statusDecs[1];
    throw new InvalidDecoratorUsageError(
      'Status',
      `${ctx.className}.${ctx.methodName}: only one @Status decorator is allowed per method`,
      {
        filePath: sourceFile.getFilePath(),
        line: secondDec.getStartLineNumber(),
        column: secondDec.getStart() - secondDec.getStartLineNumber() + 1,
      },
    );
  }

  const args = statusDecs[0].getArguments();
  if (args.length > 0) {
    const code = Number.parseInt(args[0].getText(), 10);
    if (!Number.isNaN(code)) return code;
  }

  return 200;
}

/** Extract path variable names from a route path (e.g. '/:id/:slug' → Set{'id', 'slug'}). */
function extractPathVariables(path: string): Set<string> {
  const vars = new Set<string>();
  const matches = path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const match of matches) {
    vars.add(match[1]);
  }
  return vars;
}

/** Strip `| undefined` suffix from a type name for base type checking. */
function stripUndefined(typeName: string): string {
  return typeName.replace(/\s*\|\s*undefined$/, '').trim();
}

/**
 * Check if a type is a primitive array (string[], number[], boolean[]).
 * Returns the element type if so, undefined otherwise.
 */
function extractPrimitiveArrayElement(typeName: string): string | undefined {
  const match = typeName.match(/^(string|number|boolean)\[\]$/);
  return match ? match[1] : undefined;
}

/**
 * Extract and unwrap the return type of a controller method.
 *
 * - `Promise<T>` → `T`
 * - `Response<T>` → `T`
 * - `Promise<Response<T>>` → `T`
 * - `Promise<Response<Todo> | Response<null>>` → `Todo | null`
 * - `void` → `void`
 */
function extractReturnType(methodDeclaration: MethodDeclaration): string {
  let type = methodDeclaration.getReturnType();

  // Unwrap Promise<T>
  if (isNamedType(type, 'Promise')) {
    const args = type.getTypeArguments();
    if (args.length > 0) type = args[0];
  }

  // Handle unions: unwrap Response<T> from each member
  if (type.isUnion()) {
    const members = type.getUnionTypes().map((t) => {
      const unwrapped = unwrapResponse(t);
      return typeToString(unwrapped, methodDeclaration);
    });
    return [...new Set(members)].join(' | ');
  }

  // Unwrap Response<T> for non-union
  type = unwrapResponse(type);
  return typeToString(type, methodDeclaration);
}

/** Unwrap Response<T> → T, passthrough for non-Response types. */
function unwrapResponse(type: Type): Type {
  if (isNamedType(type, 'Response')) {
    const args = type.getTypeArguments();
    if (args.length > 0) return args[0];
  }
  return type;
}

/** Check if a type's symbol name matches the given name. */
function isNamedType(type: Type, name: string): boolean {
  return (
    (type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName()) === name
  );
}

/** Convert a ts-morph Type to a clean type string, stripping import() paths. */
function typeToString(type: Type, enclosingNode: MethodDeclaration): string {
  const text = type.getText(enclosingNode);
  return text.replace(/import\([^)]+\)\./g, '');
}
