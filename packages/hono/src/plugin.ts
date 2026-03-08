import {
  type ClassVisitorContext,
  type CodegenContext,
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

/** Parsed OpenAPI options from the second argument of a route decorator. */
interface RouteOpenApiOptions {
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
  /** Raw source text of the responses object literal. */
  responsesRaw?: string;
  /** Whether responsesRaw contains resolver() calls. */
  usesResolver?: boolean;
  /** Schema references found inside responses (need importing). */
  schemaRefs?: RouteValidation[];
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
  /** OpenAPI options from the second argument of the route decorator. */
  openapi?: RouteOpenApiOptions;
}

/** Controller metadata stored on bean metadata by visitClass. */
interface ControllerMeta {
  basePath: string;
  routes: RouteDefinition[];
  /** Class-level CORS config source text, or true for @Cors() with no args. */
  cors?: string | true;
  /** Whether the class has @Secured. */
  secured?: boolean;
}

/** Extracted controller bean for codegen. */
interface ControllerBean {
  className: string;
  importPath: string;
  basePath: string;
  routes: RouteDefinition[];
  cors?: string | true;
  secured?: boolean;
}

/**
 * Transformer plugin that scans `@Controller` classes and `@Get`/`@Post`/etc.
 * route methods, then generates `createRouter()` and an `app.onStart()` hook
 * that wires the router to `EmbeddedServer`.
 *
 * When route decorators include a second argument with OpenAPI options,
 * generates `describeRoute()` middleware from `hono-openapi` and mounts
 * `openAPIRouteHandler()` to serve the OpenAPI spec.
 *
 * Reads `server.runtime` from build-time config to determine the entry point:
 * - `'node'` (default) / `'bun'` / `'deno'` → generates `app.onStart()` hook with `EmbeddedServer`
 * - `'cloudflare'` → serverless: skips the hook and `EmbeddedServer` import (use `createRouter()` directly)
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

      // Scan class-level @Secured
      const classSecured = decorators.some((d) => d.getName() === 'Secured');

      // Initialize controller metadata — routes populated by visitMethod
      metadata.controller = {
        basePath,
        routes: [],
        ...(classCors !== undefined ? { cors: classCors } : {}),
        ...(classSecured ? { secured: true } : {}),
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
      let openapi: RouteOpenApiOptions | undefined;
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

        // Parse optional second argument (OpenAPI options)
        if (args.length > 1) {
          const openapiArg = args[1];
          if (openapiArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
            openapi = parseOpenApiOptions(
              openapiArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
              methodDeclaration,
            );
          }
        }

        break;
      }

      if (!httpMethod) return;

      // Scan @Validate
      const validation = scanValidateDecorator(decorators, methodDeclaration);

      // Scan method-level @Cors
      const methodCors = scanCorsDecorator(decorators);

      // Scan method-level @Secured and @Anonymous
      const methodSecured = decorators.some((d) => d.getName() === 'Secured');
      const methodAnonymous = decorators.some(
        (d) => d.getName() === 'Anonymous',
      );

      controller.routes.push({
        methodName,
        httpMethod,
        path,
        ...(validation.length > 0 ? { validation } : {}),
        ...(methodCors !== undefined ? { cors: methodCors } : {}),
        ...(methodSecured ? { secured: true } : {}),
        ...(methodAnonymous ? { anonymous: true } : {}),
        ...(openapi ? { openapi } : {}),
      });
    },

    codegen(
      beans: IRBeanDefinition[],
      context?: CodegenContext,
    ): CodegenContribution {
      const controllerBeans = extractControllerBeans(beans);
      if (controllerBeans.length === 0) return {};

      const hasSecurity = controllerBeans.some(
        (c) => c.secured || c.routes.some((r) => r.secured),
      );
      const hasOpenApi = controllerBeans.some((c) =>
        c.routes.some((r) => r.openapi),
      );
      const hasRequestScoped = beans.some(
        (b) =>
          b.scope === 'request' &&
          isConditionallyActive(b, context?.config ?? {}),
      );

      const isServerless = context?.config['server.runtime'] === 'cloudflare';

      const imports = buildImports(
        controllerBeans,
        hasSecurity,
        hasOpenApi,
        hasRequestScoped,
        isServerless,
      );
      const code = [
        ...generateCreateRouter(
          controllerBeans,
          hasSecurity,
          hasOpenApi,
          hasRequestScoped,
        ),
        '',
        'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1]) {',
        '  return hc<AppType>(baseUrl, options)',
        '}',
      ];

      const onStart = isServerless ? undefined : generateOnStartHook();

      return { imports, code, onStart };
    },
  };
}

/** Parse the second argument of a route decorator into structured OpenAPI options. */
function parseOpenApiOptions(
  objLiteral: import('ts-morph').ObjectLiteralExpression,
  method: import('ts-morph').MethodDeclaration,
): RouteOpenApiOptions {
  const result: RouteOpenApiOptions = {};

  for (const prop of objLiteral.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const name = propAssign.getName();
    const initializer = propAssign.getInitializer();
    if (!initializer) continue;

    if (name === 'summary' || name === 'description') {
      result[name] = extractStringLiteral(initializer.getText());
    } else if (name === 'deprecated') {
      result.deprecated = initializer.getText() === 'true';
    } else if (name === 'tags') {
      if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = initializer.asKindOrThrow(
          SyntaxKind.ArrayLiteralExpression,
        );
        result.tags = arr
          .getElements()
          .map((e) => extractStringLiteral(e.getText()));
      }
    } else if (name === 'responses') {
      // Store the raw source text — it may contain resolver() calls
      result.responsesRaw = initializer.getText();

      // Scan for resolver() calls and extract schema identifiers
      const schemaRefs = scanResponseSchemaRefs(initializer, method);
      if (schemaRefs.length > 0) {
        result.schemaRefs = schemaRefs;
      }
      if (initializer.getText().includes('resolver(')) {
        result.usesResolver = true;
      }
    }
  }

  return result;
}

/** Scan a responses object literal for schema references inside resolver() calls. */
function scanResponseSchemaRefs(
  node: import('ts-morph').Node,
  method: import('ts-morph').MethodDeclaration,
): RouteValidation[] {
  const refs: RouteValidation[] = [];
  const seen = new Set<string>();

  // Find all CallExpression nodes named "resolver"
  node.forEachDescendant((descendant) => {
    if (descendant.getKind() !== SyntaxKind.CallExpression) return;
    const call = descendant.asKindOrThrow(SyntaxKind.CallExpression);
    const expr = call.getExpression();
    if (expr.getText() !== 'resolver') return;

    const args = call.getArguments();
    if (args.length === 0) return;

    const schemaArg = args[0];
    const kind = schemaArg.getKind();
    if (
      kind !== SyntaxKind.Identifier &&
      kind !== SyntaxKind.PropertyAccessExpression
    ) {
      return;
    }

    const schemaRef = schemaArg.getText();
    if (seen.has(schemaRef)) return;
    seen.add(schemaRef);

    const importPath = resolveSchemaImportPath(schemaArg, method);
    refs.push({ target: 'json', schemaRef, importPath });
  });

  return refs;
}

function extractStringLiteral(text: string): string {
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1);
  }
  return text;
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
      ...(ctrl.secured ? { secured: true } : {}),
    });
  }
  return result;
}

function generateOnStartHook(): string[] {
  return [
    'const router = createRouter(ctx)',
    'await ctx.get(EmbeddedServer).listen(router)',
  ];
}

function buildImports(
  controllers: ControllerBean[],
  hasSecurity: boolean,
  hasOpenApi: boolean,
  hasRequestScoped: boolean,
  isServerless: boolean,
): string[] {
  const imports: string[] = [];
  imports.push("import { Hono } from 'hono'");
  imports.push("import { hc } from 'hono/client'");

  // Collect all needed runtime helpers from @goodie-ts/hono
  const honoHelpers: string[] = ['handleResult'];
  if (!isServerless) {
    honoHelpers.push('EmbeddedServer');
  }
  if (hasSecurity) {
    honoHelpers.push('SECURITY_PROVIDER', 'securityMiddleware');
  }
  if (hasRequestScoped) {
    honoHelpers.push('requestScopeMiddleware');
  }

  const allRoutes = controllers.flatMap((c) => c.routes);
  const hasCors =
    controllers.some((c) => c.cors !== undefined) ||
    allRoutes.some((r) => r.cors !== undefined);
  if (hasCors) {
    honoHelpers.push('corsMiddleware');
  }

  const schemaImports = collectSchemaImports(controllers);
  const hasValidation = allRoutes.some(
    (r) => r.validation && r.validation.length > 0,
  );
  if (hasValidation) {
    honoHelpers.push('validationMiddleware');
    for (const [schemaRef, importPath] of schemaImports) {
      imports.push(`import { ${schemaRef} } from '${importPath}'`);
    }
  }

  if (hasOpenApi) {
    honoHelpers.push('mountOpenApiSpec', 'openApiMiddleware', 'OpenApiConfig');

    const usesResolver = allRoutes.some((r) => r.openapi?.usesResolver);
    if (usesResolver) {
      honoHelpers.push('resolver');
    }

    const responseSchemaImports = collectResponseSchemaImports(controllers);
    for (const [schemaRef, importPath] of responseSchemaImports) {
      if (!schemaImports.has(schemaRef)) {
        imports.push(`import { ${schemaRef} } from '${importPath}'`);
      }
    }
  }

  // Single import line for all @goodie-ts/hono helpers
  const honoTypeImports: string[] = [];
  if (hasSecurity) {
    honoTypeImports.push('SecurityProvider');
  }
  imports.push(
    `import { ${honoHelpers.sort().join(', ')} } from '@goodie-ts/hono'`,
  );
  if (honoTypeImports.length > 0) {
    imports.push(
      `import type { ${honoTypeImports.join(', ')} } from '@goodie-ts/hono'`,
    );
  }

  return imports;
}

function generateCreateRouter(
  controllers: ControllerBean[],
  hasSecurity: boolean,
  hasOpenApi: boolean,
  hasRequestScoped: boolean,
): string[] {
  const lines: string[] = [];
  const ctrlVarNames = buildControllerVarNames(controllers);

  // Per-controller route factory functions (top-level for type extraction)
  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    const factoryName = `__create${ctrl.className}Routes`;
    const ctrlHasSecurity = ctrl.secured || ctrl.routes.some((r) => r.secured);

    const params = [
      `${varName}: ${ctrl.className}`,
      ...(ctrlHasSecurity
        ? ['__securityProvider: SecurityProvider | undefined']
        : []),
    ];

    lines.push(`function ${factoryName}(${params.join(', ')}) {`);
    lines.push('  return new Hono()');
    for (const route of ctrl.routes) {
      const relativePath = escapeStringLiteral(
        route.path.startsWith('/') ? route.path : `/${route.path}`,
      );

      // Collect middleware: openApi, security, CORS, then validation
      const middleware: string[] = [];

      if (route.openapi) {
        middleware.push(generateDescribeRoute(route));
      }

      const routeNeedsAuth =
        (ctrl.secured || route.secured) && !route.anonymous;
      const routeInSecuredController = ctrl.secured && !routeNeedsAuth;

      if (routeNeedsAuth) {
        middleware.push("securityMiddleware(__securityProvider, 'required')");
      } else if (routeInSecuredController) {
        middleware.push("securityMiddleware(__securityProvider, 'optional')");
      }

      const corsConfig = route.cors ?? ctrl.cors;
      if (corsConfig !== undefined) {
        middleware.push(
          corsConfig === true
            ? 'corsMiddleware()'
            : `corsMiddleware(${corsConfig})`,
        );
      }

      middleware.push(...generateValidationMiddleware(route.validation));

      lines.push(`    .${route.httpMethod}('${relativePath}',`);
      for (const mw of middleware) {
        lines.push(`      ${mw},`);
      }
      lines.push(
        `      async (c) => handleResult(c, await ${varName}.${route.methodName}(c)))`,
      );
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

  // createRouter composes all sub-apps
  lines.push('export function createRouter(ctx: ApplicationContext) {');
  if (hasSecurity) {
    lines.push(
      '  const __securityProvider = ctx.getAll(SECURITY_PROVIDER)[0] as SecurityProvider | undefined',
    );
  }
  lines.push('  const __router = new Hono()');
  if (hasRequestScoped) {
    lines.push("  __router.use('*', requestScopeMiddleware())");
  }
  for (const ctrl of controllers) {
    const factoryName = `__create${ctrl.className}Routes`;
    const basePath = escapeStringLiteral(ctrl.basePath);
    const ctrlHasSecurity = ctrl.secured || ctrl.routes.some((r) => r.secured);
    const securityArgs = ctrlHasSecurity ? ', __securityProvider' : '';
    lines.push(
      `    .route('${basePath}', ${factoryName}(ctx.get(${ctrl.className})${securityArgs}))`,
    );
  }

  if (hasOpenApi) {
    lines.push('  const __openApiConfig = ctx.get(OpenApiConfig)');
    lines.push('  mountOpenApiSpec(__router, __openApiConfig)');
  }

  lines.push('  return __router');
  lines.push('}');
  lines.push('');
  lines.push('export type AppType = ReturnType<typeof createRouter>');

  return lines;
}

/** Generate a describeRoute() middleware call from parsed OpenAPI options. */
function generateDescribeRoute(route: RouteDefinition): string {
  const opts = route.openapi!;
  const parts: string[] = [];

  if (opts.summary) {
    parts.push(`summary: ${JSON.stringify(opts.summary)}`);
  }
  if (opts.description) {
    parts.push(`description: ${JSON.stringify(opts.description)}`);
  }
  if (opts.deprecated) {
    parts.push('deprecated: true');
  }
  if (opts.tags && opts.tags.length > 0) {
    parts.push(`tags: ${JSON.stringify(opts.tags)}`);
  }
  if (opts.responsesRaw) {
    parts.push(`responses: ${opts.responsesRaw}`);
  }

  return `openApiMiddleware({ ${parts.join(', ')} })`;
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
    (v) => `validationMiddleware('${v.target}', ${v.schemaRef})`,
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

/**
 * Check whether a bean's conditional rules are satisfied by the build-time config.
 * Used to avoid generating request-scope middleware for beans that won't be active.
 * Only evaluates `onProperty` rules (config is available at build time).
 * `onEnv` and `onMissingBean` are conservatively treated as active.
 */
function isConditionallyActive(
  bean: IRBeanDefinition,
  config: Record<string, string>,
): boolean {
  const rules = bean.metadata.conditionalRules as
    | Array<{
        type: string;
        key?: string;
        expectedValue?: string;
        expectedValues?: string[];
      }>
    | undefined;
  if (!rules || rules.length === 0) return true;

  for (const rule of rules) {
    if (rule.type !== 'onProperty') continue;
    const propValue = config[rule.key!];
    if (rule.expectedValues !== undefined) {
      if (!rule.expectedValues.includes(String(propValue))) return false;
    } else if (rule.expectedValue !== undefined) {
      if (String(propValue) !== rule.expectedValue) return false;
    } else {
      if (propValue === undefined) return false;
    }
  }
  return true;
}

function collectResponseSchemaImports(
  controllers: ControllerBean[],
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      if (!route.openapi?.schemaRefs) continue;
      for (const v of route.openapi.schemaRefs) {
        if (!imports.has(v.schemaRef)) {
          imports.set(v.schemaRef, v.importPath);
        }
      }
    }
  }
  return imports;
}
