import { ApplicationContext, type BeanDefinition } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import { ExceptionHandler } from '../src/exception-handler.js';
import type { Middleware } from '../src/middleware.js';
import { Request } from '../src/request.js';
import { Response } from '../src/response.js';
import { RouteDefinition } from '../src/route-definition.js';
import type { ControllerMetadata } from '../src/route-metadata.js';
import { Router } from '../src/router.js';

// ── Helpers ──

class TestController {
  async list() {
    return Response.ok([{ id: '1', name: 'Alice' }]);
  }

  async getById(req: Request) {
    return Response.ok({ id: req.params.id, name: 'Alice' });
  }

  async create(req: Request<{ name: string }>) {
    return Response.created({ id: '2', name: req.body.name });
  }

  async remove() {
    return Response.noContent();
  }
}

class TestError extends Error {}

class TestExceptionHandler extends ExceptionHandler {
  handle(error: unknown): Response | undefined {
    if (error instanceof TestError) {
      return Response.status(400, { error: (error as Error).message });
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

async function createContext(
  ...defs: BeanDefinition[]
): Promise<ApplicationContext> {
  return ApplicationContext.create(defs);
}

// ── Tests ──

describe('Router', () => {
  describe('fromContext — @Controller beans', () => {
    it('discovers controller routes from metadata', async () => {
      const controller = new TestController();
      const ctx = await createContext(
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
      const routes = router.getRoutes();

      expect(routes).toHaveLength(1);
      expect(routes[0].method).toBe('get');
      expect(routes[0].path).toBe('/api/users');
    });

    it('executes controller handler', async () => {
      const controller = new TestController();
      const ctx = await createContext(
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
      const route = router.getRoutes()[0];
      const req = new Request({ body: undefined });
      const res = await router.execute(route, req);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: '1', name: 'Alice' }]);
    });

    it('passes Request to controller when hasRequestParam is true', async () => {
      const controller = new TestController();
      const ctx = await createContext(
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
      const route = router.getRoutes()[0];
      const req = new Request({ body: undefined, params: { id: '42' } });
      const res = await router.execute(route, req);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: '42', name: 'Alice' });
    });
  });

  describe('fromContext — RouteDefinition beans', () => {
    it('discovers routes from RouteDefinition beans', async () => {
      const routeDef = RouteDefinition.build((router) => {
        router.get('/todos', async () => Response.ok([]));
        router.post('/todos', async (req) =>
          Response.created({ name: req.body }),
        );
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);

      expect(router.getRoutes()).toHaveLength(2);
      expect(router.getRoutes()[0].method).toBe('get');
      expect(router.getRoutes()[1].method).toBe('post');
    });

    it('executes RouteDefinition handler', async () => {
      const routeDef = RouteDefinition.build((router) => {
        router.get('/todos', async () => Response.ok([{ id: '1' }]));
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);
      const route = router.getRoutes()[0];
      const req = new Request({ body: undefined });
      const res = await router.execute(route, req);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: '1' }]);
    });
  });

  describe('fromContext — mixed sources', () => {
    it('collects routes from both controllers and RouteDefinitions', async () => {
      const controller = new TestController();
      const routeDef = RouteDefinition.build((router) => {
        router.get('/todos', async () => Response.ok([]));
      });

      const ctx = await createContext(
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
        routeDefinitionDef(routeDef),
      );

      const router = Router.fromContext(ctx);
      expect(router.getRoutes()).toHaveLength(2);
    });
  });

  describe('middleware chain', () => {
    it('executes middleware before handler', async () => {
      const callOrder: string[] = [];

      const middleware: Middleware = async (_req, next) => {
        callOrder.push('middleware');
        return next();
      };

      const routeDef = RouteDefinition.build((router) => {
        router.get('/test', middleware, async () => {
          callOrder.push('handler');
          return Response.ok('done');
        });
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });
      await router.execute(router.getRoutes()[0], req);

      expect(callOrder).toEqual(['middleware', 'handler']);
    });

    it('executes multiple middlewares in order', async () => {
      const callOrder: string[] = [];

      const mw1: Middleware = async (_req, next) => {
        callOrder.push('mw1');
        return next();
      };
      const mw2: Middleware = async (_req, next) => {
        callOrder.push('mw2');
        return next();
      };

      const routeDef = RouteDefinition.build((router) => {
        router.get('/test', mw1, mw2, async () => {
          callOrder.push('handler');
          return Response.ok('done');
        });
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });
      await router.execute(router.getRoutes()[0], req);

      expect(callOrder).toEqual(['mw1', 'mw2', 'handler']);
    });

    it('middleware can short-circuit the chain', async () => {
      const shortCircuit: Middleware = async () => {
        return Response.status(403, { error: 'forbidden' });
      };

      const routeDef = RouteDefinition.build((router) => {
        router.get('/test', shortCircuit, async () => {
          throw new Error('should not reach handler');
        });
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });
      const res = await router.execute(router.getRoutes()[0], req);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
    });
  });

  describe('exception handling', () => {
    it('delegates to exception handlers on error', async () => {
      const routeDef = RouteDefinition.build((router) => {
        router.get('/fail', async () => {
          throw new TestError('bad request');
        });
      });

      const ctx = await createContext(
        routeDefinitionDef(routeDef),
        exceptionHandlerDef(new TestExceptionHandler()),
      );

      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });
      const res = await router.execute(router.getRoutes()[0], req);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'bad request' });
    });

    it('rethrows unhandled errors', async () => {
      const routeDef = RouteDefinition.build((router) => {
        router.get('/fail', async () => {
          throw new Error('unhandled');
        });
      });

      const ctx = await createContext(routeDefinitionDef(routeDef));
      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });

      await expect(router.execute(router.getRoutes()[0], req)).rejects.toThrow(
        'unhandled',
      );
    });

    it('catches middleware errors through exception handlers', async () => {
      const failingMiddleware: Middleware = async () => {
        throw new TestError('middleware failure');
      };

      const routeDef = RouteDefinition.build((router) => {
        router.get('/test', failingMiddleware, async () => Response.ok('ok'));
      });

      const ctx = await createContext(
        routeDefinitionDef(routeDef),
        exceptionHandlerDef(new TestExceptionHandler()),
      );

      const router = Router.fromContext(ctx);
      const req = new Request({ body: undefined });
      const res = await router.execute(router.getRoutes()[0], req);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'middleware failure' });
    });
  });

  describe('empty router', () => {
    it('returns empty routes when no controllers or definitions exist', async () => {
      const ctx = await createContext();
      const router = Router.fromContext(ctx);

      expect(router.getRoutes()).toHaveLength(0);
    });
  });
});
