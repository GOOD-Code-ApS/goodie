import {
  type ClassVisitorContext,
  type CodegenContribution,
  InvalidDecoratorUsageError,
  type IRBeanDefinition,
  type MethodVisitorContext,
  type TransformerPlugin,
} from '@goodie-ts/transformer';
import { SyntaxKind } from 'ts-morph';

/** HTTP method for a route. */
type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Route decorator names mapped to HTTP methods. */
const ROUTE_DECORATOR_MAP: Record<string, HttpMethod> = {
  Get: 'get',
  Post: 'post',
  Put: 'put',
  Delete: 'delete',
  Patch: 'patch',
};

/** A validation target for a route method. */
interface RouteValidation {
  target: 'json' | 'query' | 'param';
  schemaRef: string;
  importPath: string;
}

/** A route method on a controller. */
interface RouteDefinition {
  methodName: string;
  httpMethod: HttpMethod;
  path: string;
  validation?: RouteValidation[];
}

/** Controller metadata stored on bean metadata by visitClass. */
interface ControllerMeta {
  basePath: string;
  routes: RouteDefinition[];
}

/** Extracted controller bean for codegen. */
interface ControllerBean {
  className: string;
  importPath: string;
  basePath: string;
  routes: RouteDefinition[];
}

/**
 * Transformer plugin that scans `@Controller` classes and `@Get`/`@Post`/etc.
 * route methods, then generates `createRouter()` and `startServer()`.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHonoPlugin(): TransformerPlugin {
  return {
    name: 'hono',

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

      // Register the controller as a singleton bean
      ctx.registerBean({ scope: 'singleton' });

      // Initialize controller metadata — routes populated by visitMethod
      metadata.controller = { basePath, routes: [] } satisfies ControllerMeta;
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const controller = ctx.classMetadata.controller as
        | ControllerMeta
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

      // Scan @Validate
      const validation = scanValidateDecorator(decorators, methodDeclaration);

      controller.routes.push({
        methodName,
        httpMethod,
        path,
        ...(validation.length > 0 ? { validation } : {}),
      });
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const controllerBeans = extractControllerBeans(beans);
      if (controllerBeans.length === 0) return {};

      const imports = buildImports(controllerBeans);
      const code = [
        ...generateCreateRouter(controllerBeans),
        '',
        'export async function startServer(options?: { port?: number; host?: string }) {',
        '  const ctx = await app.start()',
        '  const router = createRouter(ctx)',
        '  ctx.get(EmbeddedServer).listen(router, options)',
        '  return ctx',
        '}',
      ];

      return { imports, code };
    },
  };
}

/** Extract @Validate({ json: schema, query: schema, param: schema }) from method decorators. */
function scanValidateDecorator(
  decorators: import('ts-morph').Decorator[],
  method: import('ts-morph').MethodDeclaration,
): RouteValidation[] {
  const validateDec = decorators.find((d) => d.getName() === 'Validate');
  if (!validateDec) return [];

  const args = validateDec.getArguments();
  if (args.length === 0) return [];

  const arg = args[0];
  if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return [];

  const validations: RouteValidation[] = [];
  const objLiteral = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  for (const prop of objLiteral.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const target = propAssign.getName() as 'json' | 'query' | 'param';
    if (target !== 'json' && target !== 'query' && target !== 'param') continue;

    const initializer = propAssign.getInitializer();
    if (!initializer) continue;

    const kind = initializer.getKind();
    if (
      kind !== SyntaxKind.Identifier &&
      kind !== SyntaxKind.PropertyAccessExpression
    ) {
      const sourceFile = method.getSourceFile();
      throw new InvalidDecoratorUsageError(
        'Validate',
        `value for "${target}" must be a variable reference, got expression: ${initializer.getText()}`,
        {
          filePath: sourceFile.getFilePath(),
          line: initializer.getStartLineNumber(),
          column:
            initializer.getStart() -
            sourceFile.getFullText().lastIndexOf('\n', initializer.getStart()),
        },
      );
    }

    const schemaRef = initializer.getText();
    const importPath = resolveSchemaImportPath(initializer, method);

    validations.push({ target, schemaRef, importPath });
  }

  return validations;
}

/** Resolve the import path of a schema variable reference. */
function resolveSchemaImportPath(
  node: import('ts-morph').Node,
  method: import('ts-morph').MethodDeclaration,
): string {
  const sourceFile = method.getSourceFile();
  const varName = node.getText();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    for (const namedImport of importDecl.getNamedImports()) {
      if (namedImport.getName() === varName) {
        const moduleSpecifier = importDecl.getModuleSpecifierSourceFile();
        if (moduleSpecifier) {
          return moduleSpecifier.getFilePath();
        }
      }
    }
  }

  const symbol = node.getSymbol();
  if (symbol) {
    const declarations = symbol.getDeclarations();
    if (declarations.length > 0) {
      return declarations[0].getSourceFile().getFilePath();
    }
  }

  return sourceFile.getFilePath();
}

function extractControllerBeans(beans: IRBeanDefinition[]): ControllerBean[] {
  const result: ControllerBean[] = [];
  for (const bean of beans) {
    const ctrl = bean.metadata.controller as ControllerMeta | undefined;
    if (!ctrl) continue;
    if (bean.tokenRef.kind !== 'class') continue;
    result.push({
      className: bean.tokenRef.className,
      importPath: bean.tokenRef.importPath,
      basePath: ctrl.basePath,
      routes: ctrl.routes,
    });
  }
  return result;
}

function buildImports(controllers: ControllerBean[]): string[] {
  const imports: string[] = [];
  imports.push("import { Hono } from 'hono'");
  imports.push("import { EmbeddedServer } from '@goodie-ts/hono'");

  const allRoutes = controllers.flatMap((c) => c.routes);
  const hasValidation = allRoutes.some(
    (r) => r.validation && r.validation.length > 0,
  );
  if (hasValidation) {
    imports.push("import { zValidator } from '@hono/zod-validator'");
    const schemaImports = collectSchemaImports(controllers);
    for (const [schemaRef, importPath] of schemaImports) {
      imports.push(`import { ${schemaRef} } from '${importPath}'`);
    }
  }

  return imports;
}

function generateCreateRouter(controllers: ControllerBean[]): string[] {
  const lines: string[] = [];
  const ctrlVarNames = buildControllerVarNames(controllers);

  lines.push('export function createRouter(ctx: ApplicationContext): Hono {');
  lines.push('  const __honoApp = new Hono()');

  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    lines.push(`  const ${varName} = ctx.get(${ctrl.className})`);
  }

  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    for (const route of ctrl.routes) {
      const fullPath = escapeStringLiteral(
        joinPaths(ctrl.basePath, route.path),
      );
      const validationMiddleware = generateValidationMiddleware(
        route.validation,
      );

      if (validationMiddleware.length > 0) {
        lines.push(`  __honoApp.${route.httpMethod}('${fullPath}',`);
        for (const mw of validationMiddleware) {
          lines.push(`    ${mw},`);
        }
        lines.push('    async (c) => {');
      } else {
        lines.push(
          `  __honoApp.${route.httpMethod}('${fullPath}', async (c) => {`,
        );
      }
      lines.push(`    const result = await ${varName}.${route.methodName}(c)`);
      lines.push('    if (result instanceof Response) return result');
      lines.push(
        '    if (result === undefined || result === null) return c.body(null, 204)',
      );
      lines.push('    return c.json(result)');
      lines.push('  })');
    }
  }

  lines.push('  return __honoApp');
  lines.push('}');

  return lines;
}

function buildControllerVarNames(
  controllers: ControllerBean[],
): Map<string, string> {
  const result = new Map<string, string>();
  const varNameCounts = new Map<string, number>();

  for (const ctrl of controllers) {
    const key = controllerKey(ctrl);
    const baseVarName =
      ctrl.className.charAt(0).toLowerCase() + ctrl.className.slice(1);
    const count = varNameCounts.get(baseVarName) ?? 0;

    if (count === 0) {
      result.set(key, baseVarName);
    } else {
      result.set(key, `${baseVarName}_${count + 1}`);
    }
    varNameCounts.set(baseVarName, count + 1);
  }

  return result;
}

function controllerKey(ctrl: ControllerBean): string {
  return `${ctrl.className}:${ctrl.importPath}`;
}

function joinPaths(basePath: string, routePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (route === '/') return base || '/';
  return `${base}${route}`;
}

function escapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function generateValidationMiddleware(
  validation: RouteValidation[] | undefined,
): string[] {
  if (!validation || validation.length === 0) return [];
  return validation.map(
    (v) =>
      `zValidator('${v.target}', ${v.schemaRef}, (result, c) => { if (!result.success) return c.json({ error: 'Validation failed', issues: result.error.issues.map((i: any) => ({ path: i.path, message: i.message })) }, 400) })`,
  );
}

function collectSchemaImports(
  controllers: ControllerBean[],
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      if (!route.validation) continue;
      for (const v of route.validation) {
        if (!imports.has(v.schemaRef)) {
          imports.set(v.schemaRef, v.importPath);
        }
      }
    }
  }
  return imports;
}
