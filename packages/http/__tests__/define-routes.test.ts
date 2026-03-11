import { InjectionToken } from '@goodie-ts/core';
import { describe, expect, it, vi } from 'vitest';
import { defineRoutes } from '../src/define-routes.js';
import { Request } from '../src/request.js';
import { Response } from '../src/response.js';

// ── Helpers ──

class TodoService {
  findAll() {
    return [{ id: '1', title: 'Buy groceries' }];
  }

  create(data: { title: string }) {
    return { id: '2', title: data.title };
  }
}

const DB_URL = new InjectionToken<string>('DB_URL');

// ── Tests ──

describe('defineRoutes', () => {
  it('captures deps and builder', () => {
    const descriptor = defineRoutes(
      { todoService: TodoService },
      (_deps) => (_router) => {},
    );

    expect(descriptor.__deps).toEqual({ todoService: TodoService });
    expect(typeof descriptor.__builder).toBe('function');
  });

  it('builds RouteDefinition from resolved deps', () => {
    const todoService = new TodoService();

    const descriptor = defineRoutes(
      { todoService: TodoService },
      (deps) => (router) => {
        router.get('/todos', async () =>
          Response.ok(deps.todoService.findAll()),
        );
        router.post('/todos', async (req) =>
          Response.created(deps.todoService.create(req.body)),
        );
      },
    );

    const routeDef = descriptor.__build({ todoService });

    expect(routeDef.routes).toHaveLength(2);
    expect(routeDef.routes[0].method).toBe('get');
    expect(routeDef.routes[0].path).toBe('/todos');
    expect(routeDef.routes[1].method).toBe('post');
    expect(routeDef.routes[1].path).toBe('/todos');
  });

  it('route handlers use resolved deps', async () => {
    const todoService = new TodoService();
    const spy = vi.spyOn(todoService, 'findAll');

    const descriptor = defineRoutes(
      { todoService: TodoService },
      (deps) => (router) => {
        router.get('/todos', async () =>
          Response.ok(deps.todoService.findAll()),
        );
      },
    );

    const routeDef = descriptor.__build({ todoService });
    const req = new Request({ body: undefined });
    const res = await routeDef.routes[0].handler(req);

    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: '1', title: 'Buy groceries' }]);
  });

  it('supports InjectionToken in deps', () => {
    const descriptor = defineRoutes({ dbUrl: DB_URL }, (deps) => (router) => {
      router.get('/health', async () => Response.ok({ db: deps.dbUrl }));
    });

    const routeDef = descriptor.__build({ dbUrl: 'postgres://localhost/test' });

    expect(routeDef.routes).toHaveLength(1);
  });

  it('supports middleware in route definitions', async () => {
    const callOrder: string[] = [];

    const descriptor = defineRoutes(
      { todoService: TodoService },
      (deps) => (router) => {
        router.post(
          '/todos',
          async (_req, next) => {
            callOrder.push('middleware');
            return next();
          },
          async (req) => {
            callOrder.push('handler');
            return Response.created(deps.todoService.create(req.body));
          },
        );
      },
    );

    const routeDef = descriptor.__build({ todoService: new TodoService() });
    expect(routeDef.routes[0].middlewares).toHaveLength(1);
  });

  it('supports empty deps', () => {
    const descriptor = defineRoutes({}, () => (router) => {
      router.get('/health', async () => Response.ok({ status: 'up' }));
    });

    const routeDef = descriptor.__build({});
    expect(routeDef.routes).toHaveLength(1);
  });
});
