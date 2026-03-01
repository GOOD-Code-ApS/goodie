import { describe, expect, it } from 'vitest';
import { Controller } from '../src/controller.js';
import type { ControllerMetadata, RouteMetadata } from '../src/metadata.js';
import { HONO_META } from '../src/metadata.js';
import { Delete, Get, Patch, Post, Put } from '../src/route.js';

// Polyfill for test environment
Symbol.metadata ??= Symbol('Symbol.metadata');

function getClassMetadata(
  cls: abstract new (...args: any[]) => any,
): Record<PropertyKey, unknown> | undefined {
  return (
    cls as unknown as { [Symbol.metadata]?: Record<PropertyKey, unknown> }
  )[Symbol.metadata];
}

describe('@Controller()', () => {
  it('stores controller metadata with default basePath', () => {
    @Controller()
    class TestController {}

    const meta = getClassMetadata(TestController)!;
    const ctrl = meta[HONO_META.CONTROLLER] as ControllerMetadata;
    expect(ctrl).toBeDefined();
    expect(ctrl.basePath).toBe('/');
  });

  it('stores controller metadata with custom basePath', () => {
    @Controller('/api/users')
    class UserController {}

    const meta = getClassMetadata(UserController)!;
    const ctrl = meta[HONO_META.CONTROLLER] as ControllerMetadata;
    expect(ctrl.basePath).toBe('/api/users');
  });
});

describe('@Get()', () => {
  it('records a GET route with default path', () => {
    class TestController {
      @Get()
      getAll() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      method: 'get',
      path: '/',
      methodName: 'getAll',
    });
  });

  it('records a GET route with custom path', () => {
    class TestController {
      @Get('/:id')
      getById() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes[0].path).toBe('/:id');
  });
});

describe('@Post()', () => {
  it('records a POST route', () => {
    class TestController {
      @Post('/items')
      create() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes[0]).toEqual({
      method: 'post',
      path: '/items',
      methodName: 'create',
    });
  });
});

describe('@Put()', () => {
  it('records a PUT route', () => {
    class TestController {
      @Put('/:id')
      replace() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes[0].method).toBe('put');
  });
});

describe('@Delete()', () => {
  it('records a DELETE route', () => {
    class TestController {
      @Delete('/:id')
      remove() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes[0].method).toBe('delete');
  });
});

describe('@Patch()', () => {
  it('records a PATCH route', () => {
    class TestController {
      @Patch('/:id')
      update() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes[0].method).toBe('patch');
  });
});

describe('multiple routes on one class', () => {
  it('accumulates routes from multiple method decorators', () => {
    class TestController {
      @Get('/')
      list() {}

      @Post('/')
      create() {}

      @Get('/:id')
      getOne() {}

      @Patch('/:id')
      update() {}

      @Delete('/:id')
      remove() {}
    }

    const meta = getClassMetadata(TestController)!;
    const routes = meta[HONO_META.ROUTES] as RouteMetadata[];
    expect(routes).toHaveLength(5);
    expect(routes.map((r) => r.method)).toEqual([
      'get',
      'post',
      'get',
      'patch',
      'delete',
    ]);
    expect(routes.map((r) => r.methodName)).toEqual([
      'list',
      'create',
      'getOne',
      'update',
      'remove',
    ]);
  });
});
