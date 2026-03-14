import type { ComponentDefinition } from '@goodie-ts/core';
import { ApplicationContext } from '@goodie-ts/core';
import { ExceptionHandler, Response as HttpResponse } from '@goodie-ts/http';
import { describe, expect, it } from 'vitest';
import { createHonoRouter } from '../src/create-router.js';

/** Create an ApplicationContext from bean definitions. */
async function createContext(
  beans: ComponentDefinition[],
): Promise<ApplicationContext> {
  return ApplicationContext.create(beans, { preSorted: true });
}

/** Simple controller for testing. */
class TodoController {
  list() {
    return [
      { id: '1', title: 'Buy groceries' },
      { id: '2', title: 'Walk the dog' },
    ];
  }

  getById(id: string) {
    return { id, title: 'Test todo' };
  }

  create(body: { title: string }) {
    return { id: '3', title: body.title };
  }

  update(id: string, body: { title: string }) {
    return { id, title: body.title };
  }

  delete(id: string) {
    return { id, deleted: true };
  }

  search(query: string, limit: number) {
    return { query, limit };
  }

  withTags(tags: string[]) {
    return { tags };
  }
}

/** Controller that throws errors for exception handler testing. */
class ErrorController {
  fail() {
    throw new Error('Something went wrong');
  }
}

/** Custom exception handler for testing. */
class TestExceptionHandler extends ExceptionHandler {
  handles(error: unknown): boolean {
    return error instanceof Error && error.message === 'Something went wrong';
  }
  handle(_error: unknown): HttpResponse<unknown> {
    return HttpResponse.status(500, { error: 'handled' });
  }
}

function todoControllerDef(): ComponentDefinition {
  return {
    token: TodoController,
    scope: 'singleton',
    dependencies: [],
    factory: () => new TodoController(),
    eager: false,
    metadata: {
      httpController: {
        basePath: '/api/todos',
        routes: [
          {
            methodName: 'list',
            httpMethod: 'get',
            path: '/',
            status: 200,
            params: [],
            returnType: 'Todo[]',
          },
          {
            methodName: 'getById',
            httpMethod: 'get',
            path: '/:id',
            status: 200,
            params: [
              {
                name: 'id',
                binding: 'path',
                typeName: 'string',
                optional: false,
              },
            ],
            returnType: 'Todo',
          },
          {
            methodName: 'create',
            httpMethod: 'post',
            path: '/',
            status: 201,
            params: [
              {
                name: 'body',
                binding: 'body',
                typeName: 'CreateTodoDto',
                optional: false,
              },
            ],
            returnType: 'Todo',
          },
          {
            methodName: 'update',
            httpMethod: 'patch',
            path: '/:id',
            status: 200,
            params: [
              {
                name: 'id',
                binding: 'path',
                typeName: 'string',
                optional: false,
              },
              {
                name: 'body',
                binding: 'body',
                typeName: 'UpdateTodoDto',
                optional: false,
              },
            ],
            returnType: 'Todo',
          },
          {
            methodName: 'delete',
            httpMethod: 'delete',
            path: '/:id',
            status: 200,
            params: [
              {
                name: 'id',
                binding: 'path',
                typeName: 'string',
                optional: false,
              },
            ],
            returnType: 'void',
          },
        ],
      },
    },
  };
}

describe('createHonoRouter — runtime wiring', () => {
  it('wires GET routes and returns JSON', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: '1', title: 'Buy groceries' },
      { id: '2', title: 'Walk the dog' },
    ]);
  });

  it('extracts path parameters', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos/42');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42', title: 'Test todo' });
  });

  it('extracts body parameters on POST', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New todo' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: '3', title: 'New todo' });
  });

  it('extracts path + body on PATCH', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos/5', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '5', title: 'Updated' });
  });

  it('handles DELETE with path param', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos/7', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '7', deleted: true });
  });

  it('applies @Status default status code', async () => {
    const ctx = await createContext([todoControllerDef()]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    // The create route has status: 201
    expect(res.status).toBe(201);
  });

  it('handles query parameters with coercion', async () => {
    const ctx = await createContext([
      {
        token: TodoController,
        scope: 'singleton',
        dependencies: [],
        factory: () => new TodoController(),
        eager: false,
        metadata: {
          httpController: {
            basePath: '/api',
            routes: [
              {
                methodName: 'search',
                httpMethod: 'get',
                path: '/search',
                status: 200,
                params: [
                  {
                    name: 'query',
                    binding: 'query',
                    typeName: 'string',
                    optional: false,
                  },
                  {
                    name: 'limit',
                    binding: 'query',
                    typeName: 'number',
                    optional: false,
                  },
                ],
                returnType: '{ query: string; limit: number }',
              },
            ],
          },
        },
      },
    ]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/search?query=hello&limit=10');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe('hello');
    expect(data.limit).toBe(10);
  });

  it('wires multiple controllers', async () => {
    class HealthController {
      check() {
        return { status: 'UP' };
      }
    }

    const ctx = await createContext([
      todoControllerDef(),
      {
        token: HealthController,
        scope: 'singleton',
        dependencies: [],
        factory: () => new HealthController(),
        eager: false,
        metadata: {
          httpController: {
            basePath: '/health',
            routes: [
              {
                methodName: 'check',
                httpMethod: 'get',
                path: '/',
                status: 200,
                params: [],
                returnType: '{ status: string }',
              },
            ],
          },
        },
      },
    ]);
    const router = createHonoRouter(ctx);

    const todosRes = await router.request('/api/todos');
    expect(todosRes.status).toBe(200);

    const healthRes = await router.request('/health');
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'UP' });
  });
});

describe('createHonoRouter — exception handling', () => {
  it('delegates to exception handlers via handleException', async () => {
    const ctx = await createContext([
      {
        token: ErrorController,
        scope: 'singleton',
        dependencies: [],
        factory: () => new ErrorController(),
        eager: false,
        metadata: {
          httpController: {
            basePath: '/api',
            routes: [
              {
                methodName: 'fail',
                httpMethod: 'get',
                path: '/fail',
                status: 200,
                params: [],
                returnType: 'void',
              },
            ],
          },
        },
      },
      {
        token: TestExceptionHandler,
        scope: 'singleton',
        dependencies: [],
        factory: () => new TestExceptionHandler(),
        eager: false,
        metadata: {},
        baseTokens: [ExceptionHandler],
      },
    ]);
    const router = createHonoRouter(ctx);

    const res = await router.request('/api/fail');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'handled' });
  });

  it('re-throws unhandled exceptions', async () => {
    const ctx = await createContext([
      {
        token: ErrorController,
        scope: 'singleton',
        dependencies: [],
        factory: () => new ErrorController(),
        eager: false,
        metadata: {
          httpController: {
            basePath: '/api',
            routes: [
              {
                methodName: 'fail',
                httpMethod: 'get',
                path: '/fail',
                status: 200,
                params: [],
                returnType: 'void',
              },
            ],
          },
        },
      },
    ]);
    const router = createHonoRouter(ctx);

    await expect(router.request('/api/fail')).rejects.toThrow(
      'Something went wrong',
    );
  });
});
