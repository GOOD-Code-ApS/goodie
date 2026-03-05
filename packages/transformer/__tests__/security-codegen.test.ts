import type {
  ClassTokenRef,
  IRBeanDefinition,
  IRControllerDefinition,
} from '@goodie-ts/transformer';
import { describe, expect, it } from 'vitest';
import { generateCode } from '../src/codegen.js';

const loc = { filePath: '/src/test.ts', line: 1, column: 1 };

const securityProvider: ClassTokenRef = {
  kind: 'class',
  className: 'JwtAuth',
  importPath: '/src/JwtAuth.ts',
};

function makeBean(className: string, importPath: string): IRBeanDefinition {
  return {
    tokenRef: { kind: 'class', className, importPath },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: loc,
  };
}

describe('Security Codegen', () => {
  describe('auth middleware generation', () => {
    it('should generate auth middleware for class-level @Secured routes', () => {
      const beans = [
        makeBean('SecuredController', '/src/SecuredController.ts'),
      ];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'SecuredController',
            importPath: '/src/SecuredController.ts',
          },
          basePath: '/api',
          secured: true,
          routes: [{ methodName: 'getData', httpMethod: 'get', path: '/data' }],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        securityProvider,
      );

      expect(code).toContain('__securityProvider.authenticate(c.req.raw)');
      expect(code).toContain("c.json({ error: 'Unauthorized' }, 401)");
      expect(code).toContain("c.set('principal', principal)");
    });

    it('should generate auth middleware for method-level @Secured routes', () => {
      const beans = [makeBean('MixedController', '/src/MixedController.ts')];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'MixedController',
            importPath: '/src/MixedController.ts',
          },
          basePath: '/api',
          secured: false,
          routes: [
            { methodName: 'publicRoute', httpMethod: 'get', path: '/public' },
            {
              methodName: 'privateRoute',
              httpMethod: 'get',
              path: '/private',
              security: { secured: true, anonymous: false },
            },
          ],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        securityProvider,
      );

      // Public route should NOT have auth middleware
      expect(code).toContain("__honoApp.get('/api/public', async (c)");
      // Private route SHOULD have auth middleware
      expect(code).toContain(
        "__honoApp.get('/api/private', async (c: any, next: any)",
      );
    });

    it('should not generate middleware for unsecured routes', () => {
      const beans = [makeBean('PublicController', '/src/PublicController.ts')];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'PublicController',
            importPath: '/src/PublicController.ts',
          },
          basePath: '/public',
          secured: false,
          routes: [{ methodName: 'index', httpMethod: 'get', path: '/' }],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        securityProvider,
      );

      expect(code).not.toContain('__securityProvider');
      expect(code).not.toContain('Unauthorized');
    });
  });

  describe('@Anonymous exemption', () => {
    it('should skip auth middleware for @Anonymous routes on @Secured class', () => {
      const beans = [makeBean('ApiController', '/src/ApiController.ts')];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'ApiController',
            importPath: '/src/ApiController.ts',
          },
          basePath: '/api',
          secured: true,
          routes: [
            {
              methodName: 'health',
              httpMethod: 'get',
              path: '/health',
              security: { secured: false, anonymous: true },
            },
            { methodName: 'getData', httpMethod: 'get', path: '/data' },
          ],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        securityProvider,
      );

      // Health route has @Anonymous — no auth middleware
      expect(code).toContain("__honoApp.get('/api/health', async (c)");
      // Data route is secured via class — has auth middleware
      expect(code).toContain(
        "__honoApp.get('/api/data', async (c: any, next: any)",
      );
    });
  });

  describe('SecurityProvider as EmbeddedServer dependency', () => {
    it('should add SecurityProvider as dependency', () => {
      const beans = [
        makeBean('SecuredController', '/src/SecuredController.ts'),
        makeBean('JwtAuth', '/src/JwtAuth.ts'),
      ];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'SecuredController',
            importPath: '/src/SecuredController.ts',
          },
          basePath: '/api',
          secured: true,
          routes: [{ methodName: 'getData', httpMethod: 'get', path: '/data' }],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        securityProvider,
      );

      expect(code).toContain(
        'token: JwtAuth, optional: false, collection: false',
      );
      expect(code).toContain('__securityProvider: any');
    });
  });

  describe('no securityProvider', () => {
    it('should not generate any security middleware without securityProvider', () => {
      const beans = [makeBean('Ctrl', '/src/Ctrl.ts')];
      const controllers: IRControllerDefinition[] = [
        {
          classTokenRef: {
            kind: 'class',
            className: 'Ctrl',
            importPath: '/src/Ctrl.ts',
          },
          basePath: '/',
          secured: true,
          routes: [{ methodName: 'index', httpMethod: 'get', path: '/' }],
        },
      ];

      const code = generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        undefined,
        controllers,
        // No securityProvider passed
      );

      expect(code).not.toContain('__securityProvider');
      expect(code).not.toContain('Unauthorized');
    });
  });
});
