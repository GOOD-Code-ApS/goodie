import type { ApplicationContext, BeanDefinition } from '@goodie-ts/core';
import {
  type ControllerMetadata,
  ExceptionHandler,
  type HttpContext,
  type HttpMethod,
  handleException,
  MappedException,
  type ParamMetadata,
} from '@goodie-ts/http';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';

import {
  buildHttpContext,
  corsMiddleware,
  requestScopeMiddleware,
  toHonoErrorResponse,
  toHonoResponse,
} from './router-helpers.js';
import { ServerConfig } from './server-config.js';

/**
 * Create a Hono router from the ApplicationContext at runtime.
 *
 * Reads `metadata.httpController` from bean definitions, resolves
 * controller instances from the DI container, and wires Hono routes.
 *
 * This replaces compile-time code generation — the adapter is real
 * runtime code, not assembled strings.
 */
export function createHonoRouter(ctx: ApplicationContext): Hono {
  const definitions = ctx.getDefinitions();
  const exceptionHandlers = ctx.getAll(ExceptionHandler);
  const serverConfig = resolveServerConfig(ctx);

  const router = new Hono();

  // Global error handler — catches MappedException from handleException
  router.onError((e, c) => {
    if (e instanceof MappedException) return toHonoErrorResponse(c, e.response);
    throw e;
  });

  // Request scope middleware (if any request-scoped beans exist)
  if (definitions.some((d) => d.scope === 'request')) {
    router.use('*', requestScopeMiddleware());
  }

  // CORS middleware from ServerConfig
  if (serverConfig && hasCorsConfig(serverConfig.cors)) {
    router.use('*', corsMiddleware(serverConfig.cors));
  }

  // Security middleware — discover SecurityProvider beans via convention
  const securityMiddleware = buildSecurityMiddleware(ctx, definitions);
  if (securityMiddleware) {
    router.use('*', securityMiddleware);
  }

  // Wire controllers
  for (const def of definitions) {
    const httpCtrl = def.metadata.httpController as
      | ControllerMetadata
      | undefined;
    if (!httpCtrl) continue;

    const controller = ctx.get(def.token as any);
    const subRouter = createControllerRouter(
      controller,
      httpCtrl,
      exceptionHandlers,
    );
    router.route(httpCtrl.basePath, subRouter);
  }

  return router;
}

function createControllerRouter(
  controller: any,
  metadata: ControllerMetadata,
  exceptionHandlers: ExceptionHandler[],
): Hono {
  const router = new Hono();

  for (const route of metadata.routes) {
    const method = route.httpMethod as HttpMethod;
    const path = route.path.startsWith('/') ? route.path : `/${route.path}`;
    const defaultStatus = route.status !== 200 ? route.status : undefined;

    router[method](path, async (c: Context) => {
      try {
        const args = await resolveParams(c, route.params);
        const result = await controller[route.methodName](...args);
        return toHonoResponse(c, result, defaultStatus);
      } catch (e) {
        handleException(e, exceptionHandlers);
        throw e;
      }
    });
  }

  return router;
}

async function resolveParams(
  c: Context,
  params: ParamMetadata[],
): Promise<unknown[]> {
  const args: unknown[] = [];
  for (const param of params) {
    args.push(await extractParam(c, param));
  }
  return args;
}

async function extractParam(
  c: Context,
  param: ParamMetadata,
): Promise<unknown> {
  switch (param.binding) {
    case 'path': {
      const raw = c.req.param(param.name);
      return coerce(raw, param.typeName);
    }
    case 'query': {
      if (isArrayType(param.typeName)) {
        const raw = c.req.queries(param.name) ?? [];
        return coerceArray(raw, param.typeName);
      }
      const raw = c.req.query(param.name);
      return coerce(raw, param.typeName);
    }
    case 'body':
      return c.req.json();
    case 'context':
      return buildHttpContext(c);
  }
}

function coerce(value: string | undefined, typeName: string): unknown {
  if (value === undefined) return undefined;
  switch (typeName) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true';
    default:
      return value;
  }
}

function coerceArray(values: string[], typeName: string): unknown[] {
  const elementType = typeName.slice(0, -2); // strip '[]'
  switch (elementType) {
    case 'number':
      return values.map(Number);
    case 'boolean':
      return values.map((v) => v === 'true');
    default:
      return values;
  }
}

function isArrayType(typeName: string): boolean {
  return typeName.endsWith('[]');
}

function hasCorsConfig(cors: object): boolean {
  return Object.keys(cors).length > 0;
}

function resolveServerConfig(
  ctx: ApplicationContext,
): ServerConfig | undefined {
  try {
    return ctx.get(ServerConfig);
  } catch {
    return undefined;
  }
}

/** Duck-typed security middleware from @goodie-ts/security. */
type SecurityMiddlewareFn = (
  request: HttpContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

type CreateSecurityMiddlewareFn = (
  providers: unknown[],
) => SecurityMiddlewareFn;

/**
 * Discover SecurityProvider beans and build Hono security middleware.
 *
 * Uses convention-based discovery: finds beans with baseTokens whose
 * constructor name is 'SecurityProvider'. No direct dependency on
 * @goodie-ts/security — the adapter uses duck typing.
 *
 * Delegates to `createSecurityMiddleware()` from @goodie-ts/security
 * (dynamically imported) for the actual auth pipeline. This avoids
 * duplicating authentication logic.
 */
function buildSecurityMiddleware(
  ctx: ApplicationContext,
  definitions: readonly BeanDefinition[],
): ((c: Context, next: Next) => Promise<Response | void>) | undefined {
  const providerBaseToken = findBaseTokenByName(
    definitions,
    'SecurityProvider',
  );
  if (!providerBaseToken) return undefined;

  const providers = ctx.getAll(providerBaseToken);
  if (providers.length === 0) return undefined;

  // Lazy-load createSecurityMiddleware — resolved on first request
  let securityMw: SecurityMiddlewareFn | false | undefined;

  return async (c: Context, next: Next) => {
    // Lazy-resolve createSecurityMiddleware on first request
    if (securityMw === undefined) {
      try {
        // Dynamic import — @goodie-ts/security is an optional peer dep.
        // Use variable to prevent TypeScript from resolving the module.
        const securityPkg = '@goodie-ts/security';
        const mod = await import(/* @vite-ignore */ securityPkg);
        const factory = (
          mod as { createSecurityMiddleware?: CreateSecurityMiddlewareFn }
        ).createSecurityMiddleware;
        securityMw = factory ? factory(providers) : false;
      } catch {
        securityMw = false;
      }
    }

    if (securityMw) {
      await securityMw(buildHttpContext(c), next);
    } else {
      await next();
    }
  };
}

function findBaseTokenByName(
  definitions: readonly BeanDefinition[],
  className: string,
): BeanDefinition['token'] | undefined {
  for (const def of definitions) {
    if (def.baseTokens) {
      for (const baseToken of def.baseTokens) {
        if (typeof baseToken === 'function' && baseToken.name === className) {
          return baseToken as BeanDefinition['token'];
        }
      }
    }
  }
  return undefined;
}
