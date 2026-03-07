import type {
  ClassVisitorContext,
  CodegenContribution,
  IRBeanDefinition,
  IRDecoratorEntry,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import {
  type Node,
  type ObjectLiteralExpression,
  type Project,
  SyntaxKind,
} from 'ts-morph';

/** HTTP method for a route. */
type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

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
  cors?: string | true;
  secured?: boolean;
  anonymous?: boolean;
}

/** Controller metadata stored on bean metadata by the hono plugin. */
interface ControllerMeta {
  basePath: string;
  routes: RouteDefinition[];
  cors?: string | true;
}

// ── OpenAPI metadata accumulated by visitClass/visitMethod ──

interface ApiResponseMeta {
  status: number;
  description: string;
  schemaRef?: string;
}

interface ApiOperationMeta {
  summary?: string;
  description?: string;
  deprecated?: boolean;
}

interface OpenApiMethodMeta {
  responses: ApiResponseMeta[];
  operation?: ApiOperationMeta;
}

interface OpenApiClassMeta {
  tag?: string;
  methods: Record<string, OpenApiMethodMeta>;
}

// ── OpenAPI 3.0 spec types ──

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<string, OpenApiSchemaDefinition>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
}

interface OpenApiOperation {
  operationId: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags: string[];
  responses: Record<string, OpenApiResponse>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: { $ref: string } }>;
  };
  security?: Array<Record<string, string[]>>;
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: { type: string };
}

type OpenApiSchemaDefinition = Record<string, unknown>;

interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: { $ref: string } }>;
}

interface OpenApiSecurityScheme {
  type: string;
  scheme: string;
}

/**
 * Transformer plugin that reads controller metadata from the hono plugin
 * and generates an OpenAPI 3.0 specification file.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createOpenApiPlugin(): TransformerPlugin {
  // Schema definitions extracted from ApiSchema() calls, keyed by variable name.
  // Lazily populated on first visitClass invocation.
  let schemaDefinitions: Map<string, OpenApiSchemaDefinition> | undefined;

  return {
    name: 'openapi',

    visitClass(ctx: ClassVisitorContext): void {
      // Lazy-init: scan all source files for ApiSchema() calls
      if (!schemaDefinitions) {
        const project = ctx.classDeclaration.getSourceFile().getProject();
        schemaDefinitions = scanApiSchemas(project);
      }

      const decorators = ctx.classDeclaration.getDecorators();
      const tagDec = decorators.find((d) => d.getName() === 'ApiTag');

      const openapi: OpenApiClassMeta = { methods: {} };

      if (tagDec) {
        const args = tagDec.getArguments();
        if (args.length > 0) {
          openapi.tag = extractStringLiteral(args[0].getText());
        }
      }

      ctx.metadata.openapi = openapi;
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const openapi = ctx.classMetadata.openapi as OpenApiClassMeta | undefined;
      if (!openapi) return;

      const decorators = ctx.methodDeclaration.getDecorators();
      const methodMeta: OpenApiMethodMeta = { responses: [] };
      let hasOpenApiDecorators = false;

      // Collect @ApiResponse(status, description, { schema? }) decorators
      for (const dec of decorators) {
        if (dec.getName() === 'ApiResponse') {
          const args = dec.getArguments();
          if (args.length >= 2) {
            const status = Number.parseInt(args[0].getText(), 10);
            const description = extractStringLiteral(args[1].getText());
            if (!Number.isNaN(status) && description) {
              const response: ApiResponseMeta = { status, description };
              // Extract schema ref from optional third argument: { schema: mySchema }
              if (args.length >= 3) {
                const schemaRef = extractSchemaRef(args[2].getText());
                if (schemaRef) response.schemaRef = schemaRef;
              }
              methodMeta.responses.push(response);
              hasOpenApiDecorators = true;
            }
          }
        }
      }

      // Collect @ApiOperation({ summary, description, deprecated })
      const operationDec = decorators.find(
        (d) => d.getName() === 'ApiOperation',
      );
      if (operationDec) {
        const args = operationDec.getArguments();
        if (args.length > 0) {
          methodMeta.operation = extractObjectLiteral(args[0].getText());
          hasOpenApiDecorators = true;
        }
      }

      if (hasOpenApiDecorators) {
        openapi.methods[ctx.methodName] = methodMeta;
      }
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const controllers = extractControllers(beans);
      if (controllers.length === 0) return {};

      const spec = buildOpenApiSpec(
        controllers,
        schemaDefinitions ?? new Map(),
      );

      return {
        files: {
          'openapi.json': JSON.stringify(spec, null, 2),
        },
      };
    },
  };
}

interface ControllerInfo {
  className: string;
  basePath: string;
  routes: RouteDefinition[];
  classDecorators: IRDecoratorEntry[];
  methodDecorators: Record<string, IRDecoratorEntry[]>;
  openapi?: OpenApiClassMeta;
}

function extractControllers(beans: IRBeanDefinition[]): ControllerInfo[] {
  const result: ControllerInfo[] = [];
  for (const bean of beans) {
    const ctrl = bean.metadata.controller as ControllerMeta | undefined;
    if (!ctrl) continue;
    if (bean.tokenRef.kind !== 'class') continue;
    result.push({
      className: bean.tokenRef.className,
      basePath: ctrl.basePath,
      routes: ctrl.routes,
      classDecorators: bean.decorators ?? [],
      methodDecorators: bean.methodDecorators ?? {},
      openapi: bean.metadata.openapi as OpenApiClassMeta | undefined,
    });
  }
  return result;
}

function buildOpenApiSpec(
  controllers: ControllerInfo[],
  schemaDefinitions: Map<string, OpenApiSchemaDefinition>,
): OpenApiSpec {
  const paths: Record<string, Record<string, OpenApiOperation>> = {};
  const schemas: Record<string, OpenApiSchemaDefinition> = {};
  let hasSecured = false;

  for (const ctrl of controllers) {
    const isClassSecured = ctrl.classDecorators.some(
      (d) => d.name === 'Secured',
    );
    const tag = ctrl.openapi?.tag ?? ctrl.className;

    for (const route of ctrl.routes) {
      const fullPath = buildFullPath(ctrl.basePath, route.path);
      const openApiPath = convertToOpenApiPath(fullPath);

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      const methodOpenApi = ctrl.openapi?.methods[route.methodName];

      // Build responses: start with auto-inferred, then merge explicit
      const responses = buildResponses(
        route,
        methodOpenApi?.responses,
        schemas,
        schemaDefinitions,
      );

      const operation: OpenApiOperation = {
        operationId: route.methodName,
        tags: [tag],
        responses,
      };

      // @ApiOperation metadata
      if (methodOpenApi?.operation) {
        const op = methodOpenApi.operation;
        if (op.summary) operation.summary = op.summary;
        if (op.description) operation.description = op.description;
        if (op.deprecated) operation.deprecated = op.deprecated;
      }

      // Path parameters from route path
      const pathParams = extractPathParams(fullPath);
      const parameters: OpenApiParameter[] = pathParams.map((name) => ({
        name,
        in: 'path' as const,
        required: true,
        schema: { type: 'string' },
      }));

      // Validation-based parameters and request body
      if (route.validation) {
        for (const v of route.validation) {
          if (v.target === 'json') {
            operation.requestBody = {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${v.schemaRef}` },
                },
              },
            };
            registerSchema(schemas, v.schemaRef, schemaDefinitions);
          } else if (v.target === 'query') {
            parameters.push({
              name: v.schemaRef,
              in: 'query',
              required: false,
              schema: { type: 'object' },
            });
          } else if (v.target === 'param') {
            registerSchema(schemas, v.schemaRef, schemaDefinitions);
          }
        }
      }

      if (parameters.length > 0) {
        operation.parameters = parameters;
      }

      // Security
      const methodDecs = ctrl.methodDecorators[route.methodName] ?? [];
      const isMethodSecured = methodDecs.some((d) => d.name === 'Secured');
      const isMethodAnonymous = methodDecs.some((d) => d.name === 'Anonymous');

      const isSecured =
        (isClassSecured || isMethodSecured) && !isMethodAnonymous;
      if (isSecured) {
        operation.security = [{ bearerAuth: [] }];
        hasSecured = true;
      }

      paths[openApiPath][route.httpMethod] = operation;
    }
  }

  const spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: { title: 'API', version: '1.0.0' },
    paths,
    components: {
      schemas,
      ...(hasSecured
        ? {
            securitySchemes: {
              bearerAuth: { type: 'http', scheme: 'bearer' },
            },
          }
        : {}),
    },
  };

  return spec;
}

/**
 * Build the responses object for a route operation.
 *
 * Auto-inferred responses (defaults):
 * - Success response (200 or 201 for POST)
 * - 400 Bad Request when @Validate is present
 * - 404 Not Found when route has path parameters
 * - 500 Internal Server Error (always)
 *
 * Explicit @ApiResponse decorators override auto-inferred responses for the
 * same status code, and add additional responses.
 */
function buildResponses(
  route: RouteDefinition,
  explicitResponses: ApiResponseMeta[] | undefined,
  schemas: Record<string, OpenApiSchemaDefinition>,
  schemaDefinitions: Map<string, OpenApiSchemaDefinition>,
): Record<string, OpenApiResponse> {
  const responses: Record<string, OpenApiResponse> = {};

  // Auto-inferred: success response
  const successCode = getDefaultStatusCode(route.httpMethod);
  responses[successCode] = { description: 'Successful response' };

  // Auto-inferred: 400 when validation is present
  if (route.validation && route.validation.length > 0) {
    responses['400'] = { description: 'Validation failed' };
  }

  // Auto-inferred: 404 when path has parameters
  const hasPathParams = /:([a-zA-Z_][a-zA-Z0-9_]*)/.test(route.path);
  if (hasPathParams) {
    responses['404'] = { description: 'Not found' };
  }

  // Auto-inferred: 500 always
  responses['500'] = { description: 'Internal server error' };

  // Explicit @ApiResponse overrides/extends
  if (explicitResponses) {
    for (const r of explicitResponses) {
      const response: OpenApiResponse = { description: r.description };
      if (r.schemaRef) {
        response.content = {
          'application/json': {
            schema: { $ref: `#/components/schemas/${r.schemaRef}` },
          },
        };
        registerSchema(schemas, r.schemaRef, schemaDefinitions);
      }
      responses[String(r.status)] = response;
    }
  }

  return responses;
}

/** Build a full path by combining basePath and route path. */
function buildFullPath(basePath: string, routePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const full = `${base}${route}`;
  return full.startsWith('/') ? full : `/${full}`;
}

/** Convert Hono-style path params (:id) to OpenAPI-style ({id}). */
function convertToOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/** Extract parameter names from Hono-style path (:paramName). */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}

/** Get the default success status code for an HTTP method. */
function getDefaultStatusCode(method: HttpMethod): string {
  return method === 'post' ? '201' : '200';
}

/** Extract a string literal value, stripping surrounding quotes. */
function extractStringLiteral(text: string): string | undefined {
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1);
  }
  return undefined;
}

/** Extract an object literal's properties from source text. */
function extractObjectLiteral(text: string): ApiOperationMeta {
  const result: ApiOperationMeta = {};
  // Match key: 'value' or key: "value" patterns
  const summaryMatch = text.match(/summary\s*:\s*(['"])(.+?)\1/);
  if (summaryMatch) result.summary = summaryMatch[2];

  const descMatch = text.match(/description\s*:\s*(['"])(.+?)\1/);
  if (descMatch) result.description = descMatch[2];

  const deprecatedMatch = text.match(/deprecated\s*:\s*(true|false)/);
  if (deprecatedMatch) result.deprecated = deprecatedMatch[1] === 'true';

  return result;
}

/** Extract schema variable name from `{ schema: varName }` object literal text. */
function extractSchemaRef(text: string): string | undefined {
  const match = text.match(/schema\s*:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return match ? match[1] : undefined;
}

/**
 * Register a schema in the components.schemas map.
 * Uses the ApiSchema definition if available, falls back to `{ type: 'object' }`.
 */
function registerSchema(
  schemas: Record<string, OpenApiSchemaDefinition>,
  name: string,
  schemaDefinitions: Map<string, OpenApiSchemaDefinition>,
): void {
  schemas[name] = schemaDefinitions.get(name) ?? { type: 'object' };
}

/**
 * Scan all source files for `ApiSchema(schema, spec)` calls.
 * Returns a map of variable name → OpenAPI schema definition.
 */
function scanApiSchemas(
  project: Project,
): Map<string, OpenApiSchemaDefinition> {
  const result = new Map<string, OpenApiSchemaDefinition>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts'))
      continue;

    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const initializer = varDecl.getInitializer();
      if (!initializer) continue;
      if (initializer.getKind() !== SyntaxKind.CallExpression) continue;

      const call = initializer.asKindOrThrow(SyntaxKind.CallExpression);
      const callee = call.getExpression();
      if (callee.getText() !== 'ApiSchema') continue;

      const args = call.getArguments();
      if (args.length < 2) continue;

      const specArg = args[1];
      if (specArg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;

      const specObj = parseObjectLiteralNode(
        specArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
      );
      if (specObj) {
        result.set(varDecl.getName(), specObj);
      }
    }
  }

  return result;
}

/**
 * Recursively parse an ObjectLiteralExpression node into a plain JS object.
 * Handles string, number, boolean, array, and nested object literals.
 */
function parseObjectLiteralNode(
  node: ObjectLiteralExpression,
): OpenApiSchemaDefinition {
  const result: Record<string, unknown> = {};

  for (const prop of node.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const key = propAssign.getName();
    const init = propAssign.getInitializer();
    if (!init) continue;

    result[key] = parseValueNode(init);
  }

  return result;
}

/** Parse a single value node into a JS value. */
function parseValueNode(node: Node): unknown {
  const kind = node.getKind();

  if (kind === SyntaxKind.StringLiteral) {
    const text = node.getText();
    return text.slice(1, -1);
  }

  if (kind === SyntaxKind.NumericLiteral) {
    return Number(node.getText());
  }

  if (kind === SyntaxKind.TrueKeyword) return true;
  if (kind === SyntaxKind.FalseKeyword) return false;

  if (kind === SyntaxKind.ArrayLiteralExpression) {
    const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    return arr.getElements().map((el) => parseValueNode(el));
  }

  if (kind === SyntaxKind.ObjectLiteralExpression) {
    return parseObjectLiteralNode(
      node.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
    );
  }

  // Fallback: return raw text for unhandled node types
  return node.getText();
}
