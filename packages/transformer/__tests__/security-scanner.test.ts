import { scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

const DECORATOR_STUBS = `
  export function Controller(path?: string) { return (t: any, c: any) => {} }
  export function Get(path?: string) { return (t: any, c: any) => {} }
  export function Post(path?: string) { return (t: any, c: any) => {} }
  export function Singleton() { return (t: any, c: any) => {} }
  export function Secured() { return (t: any, c: any) => {} }
  export function Anonymous() { return (t: any, c: any) => {} }
`;

const SECURITY_PROVIDER_STUB = `
  export abstract class SecurityProvider {
    abstract authenticate(request: Request): Promise<any>;
  }
`;

describe('Security Scanner', () => {
  describe('@Secured on controller class', () => {
    it('should detect class-level @Secured', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/ApiController.ts': `
          import { Controller, Get, Secured } from './decorators.js'

          @Secured()
          @Controller('/api')
          export class ApiController {
            @Get('/')
            index() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers).toHaveLength(1);
      expect(result.controllers[0].secured).toBe(true);
    });

    it('should set secured=false when @Secured is not present', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/PublicController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/public')
          export class PublicController {
            @Get('/')
            index() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers[0].secured).toBe(false);
    });
  });

  describe('@Secured on route methods', () => {
    it('should detect method-level @Secured', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/MixedController.ts': `
          import { Controller, Get, Secured } from './decorators.js'

          @Controller('/api')
          export class MixedController {
            @Get('/public')
            publicRoute() {}

            @Secured()
            @Get('/private')
            privateRoute() {}
          }
        `,
      });

      const result = scan(project);
      const routes = result.controllers[0].routes;

      expect(routes[0].security).toBeUndefined();
      expect(routes[1].security).toEqual({
        secured: true,
        anonymous: false,
      });
    });
  });

  describe('@Anonymous decorator', () => {
    it('should detect @Anonymous exempting from class-level @Secured', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/SecuredController.ts': `
          import { Controller, Get, Secured, Anonymous } from './decorators.js'

          @Secured()
          @Controller('/api')
          export class SecuredController {
            @Anonymous()
            @Get('/health')
            health() {}

            @Get('/data')
            data() {}
          }
        `,
      });

      const result = scan(project);
      const routes = result.controllers[0].routes;

      expect(routes[0].security).toEqual({
        secured: false,
        anonymous: true,
      });
      // The /data route has no method-level security decorators
      expect(routes[1].security).toBeUndefined();
    });

    it('should warn when @Anonymous used without class-level @Secured', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/BadController.ts': `
          import { Controller, Get, Anonymous } from './decorators.js'

          @Controller('/api')
          export class BadController {
            @Anonymous()
            @Get('/health')
            health() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.warnings).toContainEqual(
        expect.stringContaining(
          '@Anonymous on BadController.health has no effect without class-level @Secured',
        ),
      );
    });
  });

  describe('SecurityProvider detection', () => {
    it('should detect extends SecurityProvider on a @Singleton bean', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/SecurityProvider.ts': SECURITY_PROVIDER_STUB,
        '/src/JwtAuth.ts': `
          import { Singleton } from './decorators.js'
          import { SecurityProvider } from './SecurityProvider.js'

          @Singleton()
          export class JwtAuth extends SecurityProvider {
            async authenticate(request: Request) { return null }
          }
        `,
      });

      const result = scan(project);

      expect(result.securityProvider).toBeDefined();
      expect(result.securityProvider!.className).toBe('JwtAuth');
    });

    it('should not detect SecurityProvider without extends', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/AuthService.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class AuthService {
            validate() { return true }
          }
        `,
      });

      const result = scan(project);

      expect(result.securityProvider).toBeUndefined();
    });

    it('should warn when multiple SecurityProvider implementations exist', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/SecurityProvider.ts': SECURITY_PROVIDER_STUB,
        '/src/JwtAuth.ts': `
          import { Singleton } from './decorators.js'
          import { SecurityProvider } from './SecurityProvider.js'

          @Singleton()
          export class JwtAuth extends SecurityProvider {
            async authenticate(request: Request) { return null }
          }
        `,
        '/src/ApiKeyAuth.ts': `
          import { Singleton } from './decorators.js'
          import { SecurityProvider } from './SecurityProvider.js'

          @Singleton()
          export class ApiKeyAuth extends SecurityProvider {
            async authenticate(request: Request) { return null }
          }
        `,
      });

      const result = scan(project);

      // First one found is used
      expect(result.securityProvider).toBeDefined();
      // Warning is emitted about duplicate
      expect(result.warnings).toContainEqual(
        expect.stringContaining(
          'Multiple SecurityProvider implementations found',
        ),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('JwtAuth'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('ApiKeyAuth'),
      );
    });
  });

  describe('combined decorators', () => {
    it('should handle @Secured + @Anonymous on different methods', () => {
      const project = createProject({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/FullController.ts': `
          import { Controller, Get, Post, Secured, Anonymous } from './decorators.js'

          @Secured()
          @Controller('/api')
          export class FullController {
            @Anonymous()
            @Get('/public')
            publicRoute() {}

            @Get('/private')
            privateRoute() {}

            @Post('/submit')
            submitRoute() {}
          }
        `,
      });

      const result = scan(project);
      const ctrl = result.controllers[0];
      const routes = ctrl.routes;

      expect(ctrl.secured).toBe(true);
      expect(routes).toHaveLength(3);

      // @Anonymous route
      expect(routes[0].security?.anonymous).toBe(true);

      // Secured routes (inherit from class, no method-level decorators)
      expect(routes[1].security).toBeUndefined();
      expect(routes[2].security).toBeUndefined();
    });
  });
});
