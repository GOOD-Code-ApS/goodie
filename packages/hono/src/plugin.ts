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
  /** Raw CORS config source text from @Cors(), or true for @Cors() with no args. */
  cors?: string | true;
  /** Whether this route requires authentication. */
  secured?: boolean;
  /** Whether this route is explicitly anonymous (overrides class-level @Secured). */
  anonymous?: boolean;
}

/** Controller metadata stored on bean metadata by visitClass. */
interface ControllerMeta {
  basePath: string;
  routes: RouteDefinition[];
  /** Class-level CORS config source text, or true for @Cors() with no args. */
  cors?: string | true;
}

/** Extracted controller bean for codegen. */
interface ControllerBean {
  className: string;
  importPath: string;
  basePath: string;
  routes: RouteDefinition[];
  cors?: string | true;
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

      ctx.registerBean({ scope: 'singleton', decoratorName: 'Controller' });

      // Scan class-level @Cors
      const classCors = scanCorsDecorator(decorators);

      // Initialize controller metadata — routes populated by visitMethod
      metadata.controller = {
        basePath,
        routes: [],
        ...(classCors !== undefined ? { cors: classCors } : {}),
      } satisfies ControllerMeta;
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

      // Scan method-level @Cors
      const methodCors = scanCorsDecorator(decorators);

      controller.routes.push({
        methodName,
        httpMethod,
        path,
        ...(validation.length > 0 ? { validation } : {}),
        ...(methodCors !== undefined ? { cors: methodCors } : {}),
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
        '',
        'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1]) {',
        '  return hc<AppType>(baseUrl, options)',
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

/** Extract @Cors() config from decorators. Returns the raw source text of the config object, `true` for no-arg @Cors(), or `undefined` if absent. */
function scanCorsDecorator(
  decorators: import('ts-morph').Decorator[],
): string | true | undefined {
  const corsDec = decorators.find((d) => d.getName() === 'Cors');
  if (!corsDec) return undefined;

  const args = corsDec.getArguments();
  if (args.length === 0) return true;

  // Return the raw source text of the options object
  return args[0].getText();
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
      ...(ctrl.cors !== undefined ? { cors: ctrl.cors } : {}),
    });
  }
  return result;
}

function buildImports(controllers: ControllerBean[]): string[] {
  const imports: string[] = [];
  imports.push("import { Hono } from 'hono'");
  imports.push("import { hc } from 'hono/client'");
  imports.push("import { EmbeddedServer, HTTP_FILTER } from '@goodie-ts/hono'");

  const allRoutes = controllers.flatMap((c) => c.routes);

  // Check if any route needs CORS (class-level or method-level)
  const hasCors =
    controllers.some((c) => c.cors !== undefined) ||
    allRoutes.some((r) => r.cors !== undefined);
  if (hasCors) {
    imports.push("import { cors } from 'hono/cors'");
  }

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

  // Helper: wraps HttpFilter[] into per-route Hono middleware with route metadata
  lines.push(
    'function __applyFilters(filters: { middleware(): (ctx: any, next: () => Promise<void>) => Promise<Response | undefined> }[], routeMeta: Record<symbol, unknown>, methodName: string) {',
  );
  lines.push(
    '  return filters.map(f => { const mw = f.middleware(); return async (c: any, next: any) => { const res = await mw({ request: c, routeMetadata: routeMeta, methodName }, next); if (res) return res } })',
  );
  lines.push('}');
  lines.push('');

  // Per-controller route factory functions (top-level for type extraction)
  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    const factoryName = `__create${ctrl.className}Routes`;

    lines.push(
      `function ${factoryName}(${varName}: ${ctrl.className}, __filters: { middleware(): (ctx: any, next: () => Promise<void>) => Promise<Response | undefined> }[]) {`,
    );
    lines.push(
      `  const __meta = (${ctrl.className} as any)[Symbol.metadata] || {}`,
    );
    lines.push('  return new Hono()');
    for (const route of ctrl.routes) {
      const relativePath = escapeStringLiteral(
        route.path.startsWith('/') ? route.path : `/${route.path}`,
      );

      // Collect middleware: filters first, then CORS, then validation
      const middleware: string[] = [];

      // Per-route HttpFilter middleware with route metadata
      middleware.push(
        `...__applyFilters(__filters, __meta, '${escapeStringLiteral(route.methodName)}')`,
      );

      // Method-level @Cors overrides class-level
      const corsConfig = route.cors ?? ctrl.cors;
      if (corsConfig !== undefined) {
        middleware.push(corsConfig === true ? 'cors()' : `cors(${corsConfig})`);
      }

      middleware.push(...generateValidationMiddleware(route.validation));

      lines.push(`    .${route.httpMethod}('${relativePath}',`);
      for (const mw of middleware) {
        lines.push(`      ${mw},`);
      }
      lines.push('      async (c) => {');
      lines.push(
        `      const result = await ${varName}.${route.methodName}(c)`,
      );
      lines.push('      if (result instanceof Response) return result');
      lines.push(
        '      if (result === undefined || result === null) return c.body(null, 204)',
      );
      lines.push('      return c.json(result)');
      lines.push('    })');
    }
    lines.push('}');

    // Per-controller route type and client factory
    const routesTypeName = `${ctrl.className}Routes`;
    lines.push(
      `export type ${routesTypeName} = ReturnType<typeof ${factoryName}>`,
    );
    const clientFactoryName = `create${ctrl.className}Client`;
    lines.push(
      `export function ${clientFactoryName}(baseUrl: string, options?: Parameters<typeof hc>[1]) { return hc<${routesTypeName}>(baseUrl, options) }`,
    );
    lines.push('');
  }

  // createRouter composes all sub-apps with per-route HttpFilter middleware
  lines.push('export function createRouter(ctx: ApplicationContext) {');
  lines.push(
    '  const __filters = ctx.getAll(HTTP_FILTER).sort((a, b) => a.order - b.order)',
  );
  lines.push('  return new Hono()');
  for (const ctrl of controllers) {
    const factoryName = `__create${ctrl.className}Routes`;
    const basePath = escapeStringLiteral(ctrl.basePath);
    lines.push(
      `    .route('${basePath}', ${factoryName}(ctx.get(${ctrl.className}), __filters))`,
    );
  }
  lines.push('}');
  lines.push('');
  lines.push('export type AppType = ReturnType<typeof createRouter>');

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
