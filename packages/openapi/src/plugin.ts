import type {
  CodegenContribution,
  IRBeanDefinition,
  IRDecoratorEntry,
  TransformerPlugin,
} from '@goodie-ts/transformer';

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

/** OpenAPI 3.0 spec types (subset). */
interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<string, OpenApiSchemaRef>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
}

interface OpenApiOperation {
  operationId: string;
  tags: string[];
  responses: Record<string, { description: string }>;
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

interface OpenApiSchemaRef {
  type: string;
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
  return {
    name: 'openapi',

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const controllers = extractControllers(beans);
      if (controllers.length === 0) return {};

      const spec = buildOpenApiSpec(controllers);

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
    });
  }
  return result;
}

function buildOpenApiSpec(controllers: ControllerInfo[]): OpenApiSpec {
  const paths: Record<string, Record<string, OpenApiOperation>> = {};
  const schemas: Record<string, OpenApiSchemaRef> = {};
  let hasSecured = false;

  for (const ctrl of controllers) {
    const isClassSecured = ctrl.classDecorators.some(
      (d) => d.name === 'Secured',
    );

    for (const route of ctrl.routes) {
      const fullPath = buildFullPath(ctrl.basePath, route.path);
      const openApiPath = convertToOpenApiPath(fullPath);

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      const operation: OpenApiOperation = {
        operationId: route.methodName,
        tags: [ctrl.className],
        responses: {
          [getDefaultStatusCode(route.httpMethod)]: {
            description: 'Successful response',
          },
        },
      };

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
            schemas[v.schemaRef] = { type: 'object' };
          } else if (v.target === 'query') {
            parameters.push({
              name: v.schemaRef,
              in: 'query',
              required: false,
              schema: { type: 'object' },
            });
          } else if (v.target === 'param') {
            // param validation references an existing path param schema;
            // we already added path params above from the route path
            // Just ensure the schema ref is tracked
            schemas[v.schemaRef] = { type: 'object' };
          }
        }
      }

      if (parameters.length > 0) {
        operation.parameters = parameters;
      }

      // Security
      const methodDecorators = ctrl.methodDecorators[route.methodName] ?? [];
      const isMethodAnonymous = methodDecorators.some(
        (d) => d.name === 'Anonymous',
      );

      if (isClassSecured && !isMethodAnonymous) {
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

/** Build a full path by combining basePath and route path. */
function buildFullPath(basePath: string, routePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const full = `${base}${route}`;
  // Normalize: ensure it starts with /
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
