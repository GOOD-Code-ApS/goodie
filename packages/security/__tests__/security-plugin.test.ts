import { type ScanResult, scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import createSecurityPlugin from '../src/plugin.js';

/** Find plugin metadata by class name (keys are "filePath:className"). */
function getMetadata(
  result: ScanResult,
  className: string,
): Record<string, unknown> | undefined {
  if (!result.pluginMetadata) return undefined;
  for (const [key, value] of result.pluginMetadata) {
    if (key.endsWith(`:${className}`)) return value;
  }
  return undefined;
}

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

const decoratorsFile = `
  export function Singleton() { return (t: any, c: any) => {} }
  export function Secured(roles?: string | string[]) { return (t: any, c: any) => {} }
  export function Anonymous() { return (t: any, c: any) => {} }
`;

describe('Security Plugin', () => {
  it('detects @Secured on class and stores classRoles', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/AdminService.ts': `
        import { Singleton, Secured } from './decorators.js'

        @Secured('ADMIN')
        @Singleton()
        export class AdminService {
          doStuff() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const bean = result.components.find(
      (b) => b.classTokenRef.className === 'AdminService',
    )!;
    expect(bean).toBeDefined();

    const security = getMetadata(result, 'AdminService');
    expect(security?.security).toEqual({
      classRoles: ['ADMIN'],
      anonymousMethods: [],
    });
  });

  it('detects @Secured with no roles (auth-only)', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/ProtectedService.ts': `
        import { Singleton, Secured } from './decorators.js'

        @Secured()
        @Singleton()
        export class ProtectedService {
          doStuff() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const security = getMetadata(result, 'ProtectedService');
    expect(security?.security).toEqual({
      classRoles: [],
      anonymousMethods: [],
    });
  });

  it('detects @Secured with array of roles', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/MultiRoleService.ts': `
        import { Singleton, Secured } from './decorators.js'

        @Secured(['ADMIN', 'EDITOR'])
        @Singleton()
        export class MultiRoleService {
          doStuff() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const security = getMetadata(result, 'MultiRoleService');
    expect(security?.security).toEqual({
      classRoles: ['ADMIN', 'EDITOR'],
      anonymousMethods: [],
    });
  });

  it('detects @Anonymous on methods', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/MixedService.ts': `
        import { Singleton, Secured, Anonymous } from './decorators.js'

        @Secured('ADMIN')
        @Singleton()
        export class MixedService {
          protectedMethod() {}

          @Anonymous()
          publicMethod() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const security = getMetadata(result, 'MixedService');
    expect(security?.security).toEqual({
      classRoles: ['ADMIN'],
      anonymousMethods: ['publicMethod'],
    });
  });

  it('records @Anonymous on non-@Secured class (creates security metadata)', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/OpenService.ts': `
        import { Singleton, Anonymous } from './decorators.js'

        @Singleton()
        export class OpenService {
          @Anonymous()
          publicMethod() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const security = getMetadata(result, 'OpenService');
    expect(security?.security).toEqual({
      classRoles: [],
      anonymousMethods: ['publicMethod'],
    });
  });

  it('does not set metadata on non-@Secured classes', () => {
    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/PlainService.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class PlainService {
          doStuff() {}
        }
      `,
    });

    const result = scan(project, [createSecurityPlugin()]);

    const metadata = getMetadata(result, 'PlainService');
    expect(metadata?.security).toBeUndefined();
  });
});
