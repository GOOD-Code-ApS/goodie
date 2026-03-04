import { scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph-builder.js';
import { resolve } from '../src/resolver.js';
import { MissingProviderError } from '../src/transformer-errors.js';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function pipeline(files: Record<string, string>) {
  const project = createProject(files);
  const scanResult = scan(project);
  const resolveResult = resolve(scanResult);
  return buildGraph(resolveResult);
}

const DECORATOR_STUBS = `
  export function Controller(path?: string) { return (t: any, c: any) => {} }
  export function Get(path?: string) { return (t: any, c: any) => {} }
  export function Singleton() { return (t: any, c: any) => {} }
  export function Secured() { return (t: any, c: any) => {} }
`;

const SECURITY_PROVIDER_STUB = `
  export abstract class SecurityProvider {
    abstract authenticate(request: Request): Promise<any>;
  }
`;

describe('Security Graph Builder', () => {
  it('should error when @Secured is used without SecurityProvider bean', () => {
    expect(() =>
      pipeline({
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
      }),
    ).toThrow(MissingProviderError);
  });

  it('should pass when @Secured is used with SecurityProvider bean', () => {
    expect(() =>
      pipeline({
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
        '/src/ApiController.ts': `
          import { Controller, Get, Secured } from './decorators.js'

          @Secured()
          @Controller('/api')
          export class ApiController {
            @Get('/')
            index() {}
          }
        `,
      }),
    ).not.toThrow();
  });

  it('should pass securityProvider through to GraphResult', () => {
    const result = pipeline({
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

    expect(result.securityProvider).toBeDefined();
    expect(result.securityProvider!.className).toBe('JwtAuth');
  });

  it('should not error when no @Secured and no SecurityProvider', () => {
    expect(() =>
      pipeline({
        '/src/decorators.ts': DECORATOR_STUBS,
        '/src/PublicController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/public')
          export class PublicController {
            @Get('/')
            index() {}
          }
        `,
      }),
    ).not.toThrow();
  });
});
