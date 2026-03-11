import { ApplicationContext, type BeanDefinition } from '@goodie-ts/core';
import type { ControllerMetadata } from '@goodie-ts/http';
import {
  ExceptionHandler,
  Response as HttpResponse,
  type Request,
  RouteDefinition,
  Router,
} from '@goodie-ts/http';
import { describe, expect, it } from 'vitest';
import { adaptRouter } from '../src/adapt-router.js';
import { ServerConfig } from '../src/server-config.js';

// ── Helpers ──

class TestController {
  async list() {
    return HttpResponse.ok([{ id: '1', name: 'Alice' }]);
  }

  async getById(req: Request) {
    return HttpResponse.ok({ id: req.params.id, name: 'Alice' });
  }

  async create(req: Request<{ name: string }>) {
    return HttpResponse.created({ id: '2', name: req.body.name });
  }

  async remove() {
    return HttpResponse.noContent();
  }
}

class TestError extends Error {}

class TestExceptionHandler extends ExceptionHandler {
  handle(error: unknown): HttpResponse | undefined {
    if (error instanceof TestError) {
      return HttpResponse.status(400, { error: (error as Error).message });
    }
    return undefined;
  }
}

function controllerDef(
  controller: TestController,
  metadata: ControllerMetadata,
): BeanDefinition {
  return {
    token: TestController,
    scope: 'singleton',
    dependencies: [],
    factory: () => controller,
    eager: false,
    metadata: { httpController: metadata },
  };
}

function routeDefinitionDef(routeDef: RouteDefinition): BeanDefinition {
  return {
    token: Symbol('RouteDefinition') as unknown as typeof RouteDefinition,
    scope: 'singleton',
    dependencies: [],
    factory: () => routeDef,
    eager: false,
    baseTokens: [RouteDefinition],
    metadata: {},
  };
}

function exceptionHandlerDef(handler: TestExceptionHandler): BeanDefinition {
  return {
    token: TestExceptionHandler,
    scope: 'singleton',
    dependencies: [],
    factory: () => handler,
    eager: false,
    baseTokens: [ExceptionHandler],
    metadata: {},
  };
}

function serverConfigDef(cors?: ServerConfig['cors']): BeanDefinition {
  const config = new ServerConfig();
  if (cors) config.cors = cors;
  return {
    token: ServerConfig,
    scope: 'singleton',
    dependencies: [],
    factory: () => config,
    eager: false,
    metadata: {},
  };
}

async function createCtx(
  ...defs: BeanDefinition[]
): Promise<ApplicationContext> {
  return ApplicationContext.create(defs);
}

// ── Tests ──

describe('adaptRouter', () => {
  it('adapts a Router with @Controller routes to Hono', async () => {
    const controller = new TestController();
    const ctx = await createCtx(
      controllerDef(controller, {
        basePath: '/api/users',
        routes: [
          {
            methodName: 'list',
            httpMethod: 'get',
            path: '/',
            hasRequestParam: false,
          },
        ],
      }),
    );

    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/api/users');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('adapts a Router with RouteDefinition routes to Hono', async () => {
    const routeDef = RouteDefinition.build((r) => {
      r.get('/todos', async () => HttpResponse.ok([{ id: '1' }]));
    });

    const ctx = await createCtx(routeDefinitionDef(routeDef));
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/todos');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: '1' }]);
  });

  it('handles POST with body', async () => {
    const routeDef = RouteDefinition.build((r) => {
      r.post('/todos', async (req) =>
        HttpResponse.created({ name: req.body.name }),
      );
    });

    const ctx = await createCtx(routeDefinitionDef(routeDef));
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob' }),
    });

    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe('Bob');
  });

  it('handles path params', async () => {
    const controller = new TestController();
    const ctx = await createCtx(
      controllerDef(controller, {
        basePath: '/api/users',
        routes: [
          {
            methodName: 'getById',
            httpMethod: 'get',
            path: '/:id',
            hasRequestParam: true,
          },
        ],
      }),
    );

    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/api/users/42');

    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('42');
  });

  it('handles exception handlers', async () => {
    const routeDef = RouteDefinition.build((r) => {
      r.get('/fail', async () => {
        throw new TestError('bad request');
      });
    });

    const ctx = await createCtx(
      routeDefinitionDef(routeDef),
      exceptionHandlerDef(new TestExceptionHandler()),
    );

    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/fail');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad request' });
  });

  it('returns 404 for unmatched routes', async () => {
    const ctx = await createCtx();
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/anything');

    expect(res.status).toBe(404);
  });

  it('applies CORS middleware when ServerConfig has cors', async () => {
    const routeDef = RouteDefinition.build((r) => {
      r.get('/api/data', async () => HttpResponse.ok({ data: 'test' }));
    });

    const ctx = await createCtx(
      routeDefinitionDef(routeDef),
      serverConfigDef({ origin: 'https://example.com' }),
    );

    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/api/data', {
      headers: { Origin: 'https://example.com' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://example.com',
    );
  });

  it('handles middleware in RouteDefinition routes', async () => {
    const callOrder: string[] = [];

    const routeDef = RouteDefinition.build((r) => {
      r.get(
        '/test',
        async (_req, next) => {
          callOrder.push('middleware');
          return next();
        },
        async () => {
          callOrder.push('handler');
          return HttpResponse.ok('done');
        },
      );
    });

    const ctx = await createCtx(routeDefinitionDef(routeDef));
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/test');

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(['middleware', 'handler']);
  });

  it('handles 204 No Content responses', async () => {
    const routeDef = RouteDefinition.build((r) => {
      r.delete('/todos/:id', async () => HttpResponse.noContent());
    });

    const ctx = await createCtx(routeDefinitionDef(routeDef));
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    const res = await hono.request('/todos/123', { method: 'DELETE' });

    expect(res.status).toBe(204);
  });
});
