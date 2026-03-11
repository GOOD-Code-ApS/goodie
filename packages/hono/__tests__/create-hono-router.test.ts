import { ApplicationContext, type BeanDefinition } from '@goodie-ts/core';
import type { ControllerMetadata } from '@goodie-ts/http';
import { ExceptionHandler, Response as HttpResponse } from '@goodie-ts/http';
import { describe, expect, it } from 'vitest';
import { createHonoRouter } from '../src/create-hono-router.js';
import { ServerConfig } from '../src/server-config.js';

// ── Helpers ──

class TestController {
  async list() {
    return HttpResponse.ok([{ id: '1', name: 'Alice' }]);
  }

  async getById(req: { params: Record<string, string> }) {
    return HttpResponse.ok({ id: req.params.id, name: 'Alice' });
  }

  async create(req: { body: { name: string } }) {
    return HttpResponse.created({ id: '2', name: req.body.name });
  }

  async remove() {
    return HttpResponse.noContent();
  }
}

class TestExceptionHandler extends ExceptionHandler {
  handle(error: unknown): HttpResponse | undefined {
    if (error instanceof TestError) {
      return HttpResponse.status(400, { error: error.message });
    }
    return undefined;
  }
}

class TestError extends Error {}

function createControllerDef(
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

function createExceptionHandlerDef(
  handler: TestExceptionHandler,
): BeanDefinition {
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

function createServerConfigDef(cors?: ServerConfig['cors']): BeanDefinition {
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

async function createContext(
  ...defs: BeanDefinition[]
): Promise<ApplicationContext> {
  return ApplicationContext.create(defs);
}

// ── Tests ──

describe('createHonoRouter', () => {
  it('registers GET route from controller metadata', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
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

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/users');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('registers multiple HTTP methods', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
        basePath: '/api/users',
        routes: [
          {
            methodName: 'list',
            httpMethod: 'get',
            path: '/',
            hasRequestParam: false,
          },
          {
            methodName: 'create',
            httpMethod: 'post',
            path: '/',
            hasRequestParam: true,
          },
          {
            methodName: 'remove',
            httpMethod: 'delete',
            path: '/:id',
            hasRequestParam: false,
          },
        ],
      }),
    );

    const router = createHonoRouter(ctx);

    const getRes = await router.request('/api/users');
    expect(getRes.status).toBe(200);

    const postRes = await router.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob' }),
    });
    expect(postRes.status).toBe(201);
    expect((await postRes.json()).name).toBe('Bob');

    const deleteRes = await router.request('/api/users/123', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);
  });

  it('passes Request<T> with body for POST', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
        basePath: '/api/users',
        routes: [
          {
            methodName: 'create',
            httpMethod: 'post',
            path: '/',
            hasRequestParam: true,
          },
        ],
      }),
    );

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Charlie');
  });

  it('delegates to exception handlers on error', async () => {
    class FailingController {
      async fail() {
        throw new TestError('bad request');
      }
    }

    const handler = new TestExceptionHandler();
    const ctx = await createContext(
      {
        token: FailingController,
        scope: 'singleton' as const,
        dependencies: [],
        factory: () => new FailingController(),
        eager: false,
        metadata: {
          httpController: {
            basePath: '/api/fail',
            routes: [
              {
                methodName: 'fail',
                httpMethod: 'get',
                path: '/',
                hasRequestParam: false,
              },
            ],
          },
        },
      },
      createExceptionHandlerDef(handler),
    );

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/fail');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad request' });
  });

  it('re-throws unhandled errors', async () => {
    class FailingController {
      async fail() {
        throw new Error('unhandled');
      }
    }

    const ctx = await createContext({
      token: FailingController,
      scope: 'singleton' as const,
      dependencies: [],
      factory: () => new FailingController(),
      eager: false,
      metadata: {
        httpController: {
          basePath: '/api/fail',
          routes: [
            {
              methodName: 'fail',
              httpMethod: 'get',
              path: '/',
              hasRequestParam: false,
            },
          ],
        },
      },
    });

    const router = createHonoRouter(ctx);

    // Unhandled errors propagate — Hono's .request() throws them
    await expect(router.request('/api/fail')).rejects.toThrow('unhandled');
  });

  it('returns empty router when no controllers exist', async () => {
    const ctx = await createContext();
    const router = createHonoRouter(ctx);

    const res = await router.request('/anything');
    expect(res.status).toBe(404);
  });

  it('applies CORS middleware when ServerConfig has cors', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
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
      createServerConfigDef({ origin: 'https://example.com' }),
    );

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/users', {
      headers: { Origin: 'https://example.com' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://example.com',
    );
  });

  it('does not apply CORS when ServerConfig has empty cors', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
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
      createServerConfigDef(),
    );

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/users');

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('handles path params in routes', async () => {
    const controller = new TestController();
    const ctx = await createContext(
      createControllerDef(controller, {
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

    const router = createHonoRouter(ctx);
    const res = await router.request('/api/users/42');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('42');
  });
});
