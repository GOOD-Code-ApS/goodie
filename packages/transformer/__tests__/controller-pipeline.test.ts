import { describe, expect, it } from 'vitest';
import type { TransformerPlugin } from '../src/options.js';
import { InvalidDecoratorUsageError } from '../src/transformer-errors.js';
import { createTestProject } from './helpers.js';

/**
 * Minimal plugin that mimics what the hono plugin does:
 * detects @Controller and calls registerBean({ scope: 'singleton' }).
 */
function createControllerPlugin(): TransformerPlugin {
  return {
    name: 'test-controller',
    visitClass(ctx) {
      const controllerDec = ctx.classDeclaration
        .getDecorators()
        .find((d) => d.getName() === 'Controller');
      if (!controllerDec) return;

      ctx.registerBean({ scope: 'singleton', decoratorName: 'Controller' });

      let basePath = '/';
      const args = controllerDec.getArguments();
      if (args.length > 0) {
        const argText = args[0].getText();
        if (
          (argText.startsWith("'") && argText.endsWith("'")) ||
          (argText.startsWith('"') && argText.endsWith('"'))
        ) {
          basePath = argText.slice(1, -1);
        }
      }
      ctx.metadata.controller = { basePath, routes: [] };
    },
  };
}

describe('Controller as Plugin-Registered Bean', () => {
  it('should register @Controller as a singleton bean via plugin', () => {
    const result = createTestProject(
      {
        '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'

        @Controller('/users')
        export class UserController {
          @Get('/')
          getAll() {}
        }
      `,
      },
      undefined,
      [createControllerPlugin()],
    );

    expect(result.beans).toHaveLength(1);
    const bean = result.beans[0];
    expect(bean.tokenRef).toMatchObject({
      kind: 'class',
      className: 'UserController',
    });
    expect(bean.scope).toBe('singleton');
  });

  it('should handle @Controller with constructor deps', () => {
    const result = createTestProject(
      {
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
      },
      undefined,
      [createControllerPlugin()],
    );

    expect(result.beans).toHaveLength(2);
    const names = result.beans.map((b) =>
      b.tokenRef.kind === 'class' ? b.tokenRef.className : b.tokenRef.tokenName,
    );
    expect(names.indexOf('UserService')).toBeLessThan(
      names.indexOf('UserController'),
    );
  });

  it('should mix controllers and regular singletons', () => {
    const result = createTestProject(
      {
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
      },
      undefined,
      [createControllerPlugin()],
    );

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

  it('should not register @Controller without a plugin', () => {
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

    // Without a plugin calling registerBean, @Controller alone does nothing
    expect(result.beans).toHaveLength(0);
  });

  it('should throw when @Controller is combined with @Singleton', () => {
    expect(() =>
      createTestProject(
        {
          '/src/UserController.ts': `
          import { Controller, Singleton } from './decorators.js'

          @Controller('/users')
          @Singleton()
          export class UserController {}
        `,
        },
        undefined,
        [createControllerPlugin()],
      ),
    ).toThrow(InvalidDecoratorUsageError);
  });

  it('should throw when @Controller is combined with @Injectable', () => {
    expect(() =>
      createTestProject(
        {
          '/src/UserController.ts': `
          import { Controller, Injectable } from './decorators.js'

          @Controller('/users')
          @Injectable()
          export class UserController {}
        `,
        },
        undefined,
        [createControllerPlugin()],
      ),
    ).toThrow(InvalidDecoratorUsageError);
  });

  it('should throw when @Controller is combined with @Module', () => {
    expect(() =>
      createTestProject(
        {
          '/src/UserController.ts': `
          import { Controller, Module } from './decorators.js'

          @Controller('/users')
          @Module()
          export class UserController {}
        `,
        },
        undefined,
        [createControllerPlugin()],
      ),
    ).toThrow(InvalidDecoratorUsageError);
  });

  it('should throw when @Controller is applied to abstract class', () => {
    expect(() =>
      createTestProject(
        {
          '/src/UserController.ts': `
          import { Controller } from './decorators.js'

          @Controller('/users')
          export abstract class UserController {}
        `,
        },
        undefined,
        [createControllerPlugin()],
      ),
    ).toThrow(/Cannot apply @Controller/);
  });

  it('should throw when two plugins register the same class', () => {
    const plugin1 = createControllerPlugin();
    const plugin2: TransformerPlugin = {
      name: 'duplicate-registrar',
      visitClass(ctx) {
        const dec = ctx.classDeclaration
          .getDecorators()
          .find((d) => d.getName() === 'Controller');
        if (dec) {
          ctx.registerBean({ scope: 'singleton', decoratorName: 'Duplicate' });
        }
      },
    };

    expect(() =>
      createTestProject(
        {
          '/src/UserController.ts': `
          import { Controller } from './decorators.js'

          @Controller('/users')
          export class UserController {}
        `,
        },
        undefined,
        [plugin1, plugin2],
      ),
    ).toThrow(/already registered as a bean/);
  });
});
