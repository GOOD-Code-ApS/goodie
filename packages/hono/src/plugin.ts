import type {
  ControllerMetadata,
  HttpMethod,
  RouteMetadata,
} from '@goodie-ts/http';
import type {
  CodegenContext,
  CodegenContribution,
  IRBeanDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Controller bean extracted for codegen. */
interface ControllerBean {
  className: string;
  importPath: string;
  basePath: string;
  routes: RouteInfo[];
}

/** Route info from the http plugin metadata. */
interface RouteInfo {
  methodName: string;
  httpMethod: HttpMethod;
  path: string;
  hasRequestParam: boolean;
}

/**
 * Hono adapter transformer plugin.
 *
 * Reads route metadata from the http plugin (`metadata.httpController`) and
 * generates `createRouter()`, per-controller route factories, RPC clients,
 * and an `app.onStart()` hook that wires the router to `EmbeddedServer`.
 *
 * CORS is config-driven via `server.cors.*` properties in ServerConfig.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHonoPlugin(): TransformerPlugin {
  return {
    name: 'hono',

    codegen(
      beans: IRBeanDefinition[],
      context?: CodegenContext,
    ): CodegenContribution {
      const controllerBeans = extractControllerBeans(beans);
      if (controllerBeans.length === 0) return {};

      const hasRequestScoped = beans.some(
        (b) =>
          b.scope === 'request' &&
          isConditionallyActive(b, context?.config ?? {}),
      );

      const isServerless = context?.config['server.runtime'] === 'cloudflare';
      const config = context?.config ?? {};

      const hasRequestParam = controllerBeans.some((c) =>
        c.routes.some((r) => r.hasRequestParam),
      );
      const hasCors = hasCorsConfig(config);
      const imports = buildImports(
        hasRequestScoped,
        isServerless,
        hasRequestParam,
        hasCors,
      );
      const code = [
        ...generateCreateRouter(
          controllerBeans,
          hasRequestScoped,
          hasCors,
          config,
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

function extractControllerBeans(beans: IRBeanDefinition[]): ControllerBean[] {
  const result: ControllerBean[] = [];
  for (const bean of beans) {
    const httpCtrl = bean.metadata.httpController as
      | ControllerMetadata
      | undefined;
    if (!httpCtrl) continue;
    if (bean.tokenRef.kind !== 'class') continue;

    const routes: RouteInfo[] = httpCtrl.routes.map((route: RouteMetadata) => ({
      methodName: route.methodName,
      httpMethod: route.httpMethod,
      path: route.path,
      hasRequestParam: route.hasRequestParam,
    }));

    result.push({
      className: bean.tokenRef.className,
      importPath: bean.tokenRef.importPath,
      basePath: httpCtrl.basePath,
      routes,
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
  hasRequestScoped: boolean,
  isServerless: boolean,
  hasRequestParam: boolean,
  hasCors: boolean,
): string[] {
  const imports: string[] = [];
  imports.push("import { Hono } from 'hono'");
  imports.push("import { hc } from 'hono/client'");

  const honoHelpers: string[] = ['handleResult'];
  if (hasCors) {
    honoHelpers.push('corsMiddleware');
  }
  if (!isServerless) {
    honoHelpers.push('EmbeddedServer');
  }
  if (hasRequestScoped) {
    honoHelpers.push('requestScopeMiddleware');
  }
  if (hasRequestParam) {
    honoHelpers.push('buildRequest');
  }

  imports.push(
    `import { ${honoHelpers.sort().join(', ')} } from '@goodie-ts/hono'`,
  );

  return imports;
}

function generateCreateRouter(
  controllers: ControllerBean[],
  hasRequestScoped: boolean,
  hasCors: boolean,
  config: Record<string, string> = {},
): string[] {
  const lines: string[] = [];
  const ctrlVarNames = buildControllerVarNames(controllers);

  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    const factoryName = `__create${ctrl.className}Routes`;

    lines.push(`function ${factoryName}(${varName}: ${ctrl.className}) {`);
    lines.push('  return new Hono()');
    for (const route of ctrl.routes) {
      const relativePath = escapeStringLiteral(
        route.path.startsWith('/') ? route.path : `/${route.path}`,
      );

      lines.push(`    .${route.httpMethod}('${relativePath}',`);
      if (route.hasRequestParam) {
        const hasBody = ['post', 'put', 'patch'].includes(route.httpMethod);
        lines.push(
          `      async (c) => handleResult(c, await ${varName}.${route.methodName}(await buildRequest(c, ${hasBody}))))`,
        );
      } else {
        lines.push(
          `      async (c) => handleResult(c, await ${varName}.${route.methodName}()))`,
        );
      }
    }
    lines.push('}');

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

  lines.push('export function createRouter(ctx: ApplicationContext) {');
  lines.push('  const __router = new Hono()');
  if (hasRequestScoped) {
    lines.push("  __router.use('*', requestScopeMiddleware())");
  }
  if (hasCors) {
    lines.push(
      `  __router.use('*', corsMiddleware(${buildCorsConfig(config)}))`,
    );
  }
  for (const ctrl of controllers) {
    const factoryName = `__create${ctrl.className}Routes`;
    const basePath = escapeStringLiteral(ctrl.basePath);
    lines.push(
      `    .route('${basePath}', ${factoryName}(ctx.get(${ctrl.className})))`,
    );
  }

  lines.push('  return __router');
  lines.push('}');
  lines.push('');
  lines.push('export type AppType = ReturnType<typeof createRouter>');

  return lines;
}

/** Check if any server.cors.* config keys exist. */
function hasCorsConfig(config: Record<string, string>): boolean {
  return Object.keys(config).some((key) => key.startsWith('server.cors.'));
}

/** Build CORS config object literal from server.cors.* config properties. */
function buildCorsConfig(config: Record<string, string>): string {
  const parts: string[] = [];

  const origin = config['server.cors.origin'];
  if (origin) {
    if (origin.includes(',')) {
      const origins = origin.split(',').map((o) => `'${o.trim()}'`);
      parts.push(`origin: [${origins.join(', ')}]`);
    } else {
      parts.push(`origin: '${origin}'`);
    }
  }

  const allowMethods = config['server.cors.allowMethods'];
  if (allowMethods) {
    const methods = allowMethods.split(',').map((m) => `'${m.trim()}'`);
    parts.push(`allowMethods: [${methods.join(', ')}]`);
  }

  const allowHeaders = config['server.cors.allowHeaders'];
  if (allowHeaders) {
    const headers = allowHeaders.split(',').map((h) => `'${h.trim()}'`);
    parts.push(`allowHeaders: [${headers.join(', ')}]`);
  }

  const exposeHeaders = config['server.cors.exposeHeaders'];
  if (exposeHeaders) {
    const headers = exposeHeaders.split(',').map((h) => `'${h.trim()}'`);
    parts.push(`exposeHeaders: [${headers.join(', ')}]`);
  }

  const maxAge = config['server.cors.maxAge'];
  if (maxAge) {
    parts.push(`maxAge: ${maxAge}`);
  }

  const credentials = config['server.cors.credentials'];
  if (credentials) {
    parts.push(`credentials: ${credentials}`);
  }

  if (parts.length === 0) return '';
  return `{ ${parts.join(', ')} }`;
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
