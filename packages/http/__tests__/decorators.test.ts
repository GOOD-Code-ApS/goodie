import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Status,
} from '@goodie-ts/http';
import { describe, expect, it } from 'vitest';

describe('@Controller()', () => {
  it('is a no-op at runtime (compile-time marker)', () => {
    expect(() => {
      @Controller()
      class _TestController {}
    }).not.toThrow();
  });

  it('accepts a basePath argument without throwing', () => {
    expect(() => {
      @Controller('/api/users')
      class _UserController {}
    }).not.toThrow();
  });
});

describe('route decorators', () => {
  it('@Get is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Get('/')
        getAll() {}
      }
    }).not.toThrow();
  });

  it('@Post is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Post('/items')
        create() {}
      }
    }).not.toThrow();
  });

  it('@Put is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Put('/:id')
        replace() {}
      }
    }).not.toThrow();
  });

  it('@Delete is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Delete('/:id')
        remove() {}
      }
    }).not.toThrow();
  });

  it('@Patch is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Patch('/:id')
        update() {}
      }
    }).not.toThrow();
  });

  it('@Status is a no-op at runtime', () => {
    expect(() => {
      class _TestController {
        @Status(201)
        @Post('/')
        create() {}
      }
    }).not.toThrow();
  });

  it('multiple route decorators on one class do not throw', () => {
    expect(() => {
      class _TestController {
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
    }).not.toThrow();
  });
});
