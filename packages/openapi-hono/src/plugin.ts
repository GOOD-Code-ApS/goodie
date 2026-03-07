import type {
  ClassVisitorContext,
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import { SyntaxKind } from 'ts-morph';

/** HTTP method for a route (must match hono plugin's type). */
type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Validation target from hono plugin's RouteValidation. */
interface RouteValidation {
  target: 'json' | 'query' | 'param';
  schemaRef: string;
  importPath: string;
}

/** Route definition from hono plugin's controller metadata. */
interface RouteDefinition {
  methodName: string;
  httpMethod: HttpMethod;
  path: string;
  validation?: RouteValidation[];
  secured?: boolean;
  anonymous?: boolean;
}

/** Controller metadata from hono plugin's bean.metadata.controller. */
interface ControllerMeta {
  basePath: string;
  routes: RouteDefinition[];
  secured?: boolean;
}

/** OpenAPI-specific metadata stored by this plugin on bean.metadata.openapi. */
interface OpenApiMeta {
  tag?: string;
  methods: Record<string, MethodOpenApiMeta>;
}

interface MethodOpenApiMeta {
  operation?: {
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
  };
  responses: Array<{ status: number; description: string }>;
}

/** Controller with combined hono + openapi metadata for codegen. */
interface ControllerInfo {
  className: string;
  basePath: string;
  routes: RouteDefinition[];
  secured?: boolean;
  tag?: string;
  methodMeta: Record<string, MethodOpenApiMeta>;
}

/**
 * Transformer plugin that generates `@hono/zod-openapi` route definitions
 * from controller metadata produced by the hono plugin.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createOpenApiHonoPlugin(): TransformerPlugin {
  return {
    name: 'openapi-hono',

    visitClass(ctx: ClassVisitorContext): void {
      const { classDeclaration, metadata } = ctx;
      const decorators = classDeclaration.getDecorators();

      // Only process controllers (already registered by hono plugin)
      if (!decorators.some((d) => d.getName() === 'Controller')) return;

      const apiTagDec = decorators.find((d) => d.getName() === 'ApiTag');
      let tag: string | undefined;
      if (apiTagDec) {
        const args = apiTagDec.getArguments();
        if (args.length > 0) {
          tag = extractStringLiteral(args[0].getText());
        }
      }

      metadata.openapi = {
        ...(tag ? { tag } : {}),
        methods: {},
      } satisfies OpenApiMeta;
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const openapi = ctx.classMetadata.openapi as OpenApiMeta | undefined;
      if (!openapi) return;

      const { methodDeclaration, methodName } = ctx;
      const decorators = methodDeclaration.getDecorators();

      // Scan @ApiOperation
      let operation: MethodOpenApiMeta['operation'];
      const opDec = decorators.find((d) => d.getName() === 'ApiOperation');
      if (opDec) {
        const args = opDec.getArguments();
        if (
          args.length > 0 &&
          args[0].getKind() === SyntaxKind.ObjectLiteralExpression
        ) {
          operation = parseApiOperationArg(
            args[0].asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
          );
        }
      }

      // Scan @ApiResponse (can be stacked)
      const responses: Array<{ status: number; description: string }> = [];
      for (const dec of decorators) {
        if (dec.getName() !== 'ApiResponse') continue;
        const args = dec.getArguments();
        if (args.length >= 2) {
          const status = Number(args[0].getText());
          const description = extractStringLiteral(args[1].getText());
          if (!Number.isNaN(status) && description) {
            responses.push({ status, description });
          }
        }
      }

      if (operation || responses.length > 0) {
        openapi.methods[methodName] = {
          ...(operation ? { operation } : {}),
          responses,
        };
      }
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const controllers = extractControllers(beans);
      if (controllers.length === 0) return {};

      const hasSecurity = controllers.some(
        (c) => c.secured || c.routes.some((r) => r.secured),
      );

      const imports = buildImports(controllers, hasSecurity);
      const code = generateCode(controllers, hasSecurity);

      return { imports, code };
    },
  };
}

function extractControllers(beans: IRBeanDefinition[]): ControllerInfo[] {
  const result: ControllerInfo[] = [];
  for (const bean of beans) {
    const ctrl = bean.metadata.controller as ControllerMeta | undefined;
    if (!ctrl) continue;
    if (bean.tokenRef.kind !== 'class') continue;

    const openapi = bean.metadata.openapi as OpenApiMeta | undefined;

    result.push({
      className: bean.tokenRef.className,
      basePath: ctrl.basePath,
      routes: ctrl.routes,
      secured: ctrl.secured,
      tag: openapi?.tag,
      methodMeta: openapi?.methods ?? {},
    });
  }
  return result;
}

function buildImports(
  controllers: ControllerInfo[],
  hasSecurity: boolean,
): string[] {
  const imports: string[] = [];
  imports.push("import { createRoute, OpenAPIHono } from '@hono/zod-openapi'");
  imports.push("import { OpenApiConfig } from '@goodie-ts/openapi-hono'");

  // Collect schema imports from @Validate
  const schemaImports = new Map<string, string>();
  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      if (!route.validation) continue;
      for (const v of route.validation) {
        if (!schemaImports.has(v.schemaRef)) {
          schemaImports.set(v.schemaRef, v.importPath);
        }
      }
    }
  }

  for (const [schemaRef, importPath] of schemaImports) {
    imports.push(`import { ${schemaRef} } from '${importPath}'`);
  }

  if (hasSecurity) {
    imports.push("import { SECURITY_PROVIDER } from '@goodie-ts/hono'");
    imports.push("import type { SecurityProvider } from '@goodie-ts/hono'");
  }

  return imports;
}

function generateCode(
  controllers: ControllerInfo[],
  hasSecurity: boolean,
): string[] {
  const lines: string[] = [];

  // Generate route definitions per controller
  for (const ctrl of controllers) {
    const tag = ctrl.tag ?? ctrl.className;

    for (const route of ctrl.routes) {
      const routeVarName = `__${camelCase(ctrl.className)}_${route.methodName}_route`;
      const fullPath = joinPath(ctrl.basePath, route.path);
      const openApiPath = honoPathToOpenApi(fullPath);

      const methodMeta = ctrl.methodMeta[route.methodName];

      // Build request object
      const requestParts: string[] = [];
      if (route.validation) {
        for (const v of route.validation) {
          if (v.target === 'json') {
            requestParts.push(
              `body: { content: { 'application/json': { schema: ${v.schemaRef} } } }`,
            );
          } else if (v.target === 'query') {
            requestParts.push(`query: ${v.schemaRef}`);
          } else if (v.target === 'param') {
            requestParts.push(`params: ${v.schemaRef}`);
          }
        }
      }

      // Build responses
      const responses = buildResponses(route, ctrl.secured, methodMeta);

      // Build security
      const security: string[] = [];
      if ((ctrl.secured || route.secured) && !route.anonymous) {
        security.push('{ bearer: [] }');
      }

      // Build operation metadata
      const operationParts: string[] = [];
      operationParts.push(`method: '${route.httpMethod}'`);
      operationParts.push(`path: '${openApiPath}'`);

      if (methodMeta?.operation?.summary) {
        operationParts.push(
          `summary: ${JSON.stringify(methodMeta.operation.summary)}`,
        );
      }
      if (methodMeta?.operation?.description) {
        operationParts.push(
          `description: ${JSON.stringify(methodMeta.operation.description)}`,
        );
      }
      if (methodMeta?.operation?.deprecated) {
        operationParts.push('deprecated: true');
      }

      const tags = methodMeta?.operation?.tags ?? [tag];
      operationParts.push(`tags: ${JSON.stringify(tags)}`);

      if (requestParts.length > 0) {
        operationParts.push(`request: { ${requestParts.join(', ')} }`);
      }
      if (security.length > 0) {
        operationParts.push(`security: [${security.join(', ')}]`);
      }
      operationParts.push(`responses: { ${responses.join(', ')} }`);

      lines.push(
        `const ${routeVarName} = createRoute({ ${operationParts.join(', ')} })`,
      );
    }
  }

  lines.push('');

  // Generate createOpenApiRouter function
  lines.push('export function createOpenApiRouter(ctx: ApplicationContext) {');
  lines.push('  const config = ctx.get(OpenApiConfig)');

  if (hasSecurity) {
    lines.push(
      '  const __securityProvider = ctx.getAll(SECURITY_PROVIDER)[0] as SecurityProvider | undefined',
    );
  }

  lines.push('  const openApiApp = new OpenAPIHono()');

  // Register routes
  for (const ctrl of controllers) {
    const ctrlVar = camelCase(ctrl.className);
    lines.push(`  const ${ctrlVar} = ctx.get(${ctrl.className})`);

    for (const route of ctrl.routes) {
      const routeVarName = `__${ctrlVar}_${route.methodName}_route`;
      const routeNeedsAuth =
        (ctrl.secured || route.secured) && !route.anonymous;
      const routeInSecuredController =
        ctrl.secured && !routeNeedsAuth && route.anonymous;

      // Build middleware array
      const middlewareParts: string[] = [];
      if (routeNeedsAuth) {
        middlewareParts.push(
          `async (c: any, next: any) => { if (!__securityProvider) return c.json({ error: 'Unauthorized' }, 401); const __req = { headers: { get: (n: string) => c.req.header(n) }, url: c.req.url, method: c.req.method }; const __principal = await __securityProvider.authenticate(__req); if (!__principal) return c.json({ error: 'Unauthorized' }, 401); c.set('principal', __principal); return next() }`,
        );
      } else if (routeInSecuredController) {
        middlewareParts.push(
          `async (c: any, next: any) => { if (!__securityProvider) return next(); const __req = { headers: { get: (n: string) => c.req.header(n) }, url: c.req.url, method: c.req.method }; const __principal = await __securityProvider.authenticate(__req); if (__principal) c.set('principal', __principal); return next() }`,
        );
      }

      if (middlewareParts.length > 0) {
        lines.push(
          `  openApiApp.use(${routeVarName}.getRoutingPath(), ${middlewareParts[0]})`,
        );
      }

      lines.push(`  openApiApp.openapi(${routeVarName}, async (c) => {`);
      lines.push(`    const result = await ${ctrlVar}.${route.methodName}(c)`);
      lines.push('    if (result instanceof Response) return result');
      lines.push(
        '    if (result === undefined || result === null) return c.body(null, 204) as any',
      );
      lines.push('    return c.json(result as any)');
      lines.push('  })');
    }
  }

  // Add doc endpoint
  lines.push("  openApiApp.doc('/openapi.json', (c) => ({");
  lines.push("    openapi: '3.1.0',");
  lines.push('    info: {');
  lines.push('      title: config.title,');
  lines.push('      version: config.version,');
  lines.push(
    '      ...(config.description ? { description: config.description } : {}),',
  );
  lines.push('    },');
  if (hasSecurity) {
    lines.push('    security: [{ bearer: [] }],');
  }
  lines.push('  }))');

  lines.push('  return openApiApp');
  lines.push('}');

  return lines;
}

function buildResponses(
  route: RouteDefinition,
  controllerSecured: boolean | undefined,
  methodMeta: MethodOpenApiMeta | undefined,
): string[] {
  const responses: string[] = [];
  const explicitStatuses = new Set(
    methodMeta?.responses.map((r) => r.status) ?? [],
  );

  // Add explicit responses first
  if (methodMeta?.responses) {
    for (const r of methodMeta.responses) {
      responses.push(
        `${r.status}: { description: ${JSON.stringify(r.description)} }`,
      );
    }
  }

  // Auto-infer success response
  if (!explicitStatuses.has(200) && !explicitStatuses.has(201)) {
    const successStatus = route.httpMethod === 'post' ? 201 : 200;
    responses.push(`${successStatus}: { description: 'Success' }`);
  }

  // Auto-infer 400 if validated
  if (
    route.validation &&
    route.validation.length > 0 &&
    !explicitStatuses.has(400)
  ) {
    responses.push("400: { description: 'Validation failed' }");
  }

  // Auto-infer 401 if secured
  if (
    (controllerSecured || route.secured) &&
    !route.anonymous &&
    !explicitStatuses.has(401)
  ) {
    responses.push("401: { description: 'Unauthorized' }");
  }

  // Auto-infer 404 if path has parameters
  if (route.path.includes(':') && !explicitStatuses.has(404)) {
    responses.push("404: { description: 'Not found' }");
  }

  return responses;
}

function honoPathToOpenApi(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

function joinPath(base: string, route: string): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  if (normalizedRoute === '/') return normalizedBase || '/';
  return `${normalizedBase}${normalizedRoute}`;
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
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

function parseApiOperationArg(
  objLiteral: import('ts-morph').ObjectLiteralExpression,
): MethodOpenApiMeta['operation'] {
  const result: MethodOpenApiMeta['operation'] = {};

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
    }
  }

  return result;
}
