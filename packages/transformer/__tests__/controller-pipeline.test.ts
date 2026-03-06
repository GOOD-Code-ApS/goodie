import { describe, expect, it } from 'vitest';
import { createTestProject } from './helpers.js';

describe('Controller as Singleton Bean', () => {
  it('should register @Controller as a singleton bean', () => {
    const result = createTestProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'

        @Controller('/users')
        export class UserController {
          @Get('/')
          getAll() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(1);
    const bean = result.beans[0];
    expect(bean.tokenRef).toMatchObject({
      kind: 'class',
      className: 'UserController',
    });
    expect(bean.scope).toBe('singleton');
  });

  it('should handle @Controller with constructor deps', () => {
    const result = createTestProject({
      '/src/UserService.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class UserService {}
      `,
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        import { UserService } from './UserService.js'

        @Controller('/users')
        export class UserController {
          constructor(private userService: UserService) {}

          @Get('/')
          getAll() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(2);
    const names = result.beans.map((b) =>
      b.tokenRef.kind === 'class' ? b.tokenRef.className : b.tokenRef.tokenName,
    );
    expect(names.indexOf('UserService')).toBeLessThan(
      names.indexOf('UserController'),
    );
  });

  it('should mix controllers and regular singletons', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        import { Service } from './Service.js'

        @Controller('/users')
        export class UserController {
          constructor(private service: Service) {}

          @Get('/')
          getAll() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(2);
  });

  it('should not produce controller metadata for non-controller classes', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    expect(result.beans).toHaveLength(1);
    expect(result.beans[0].metadata.controller).toBeUndefined();
  });
});
