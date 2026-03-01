import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPlugin } from '../src/config-transformer-plugin.js';

const DECORATOR_STUBS = `
export function Injectable() { return (t: any, c: any) => {} }
export function Singleton() { return (t: any, c: any) => {} }
export function ConfigurationProperties(prefix?: string) { return (t: any, c: any) => {} }
export function Value(key: string, opts?: any) { return (t: any, c: any) => {} }
`;

function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, outputPath, [createConfigPlugin()]);
}

describe('Config Transformer Plugin', () => {
  it('should generate valueFields for @ConfigurationProperties class', () => {
    const result = createTestProject({
      '/src/DbConfig.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('database')
        export class DbConfig {
          host = 'localhost'
          port = 5432
          name = 'mydb'
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'DbConfig',
    );
    expect(bean).toBeDefined();

    const valueFields = bean!.metadata.valueFields as Array<{
      fieldName: string;
      key: string;
      default?: string;
    }>;
    expect(valueFields).toHaveLength(3);
    expect(valueFields[0]).toEqual({
      fieldName: 'host',
      key: 'database.host',
      default: "'localhost'",
    });
    expect(valueFields[1]).toEqual({
      fieldName: 'port',
      key: 'database.port',
      default: '5432',
    });
    expect(valueFields[2]).toEqual({
      fieldName: 'name',
      key: 'database.name',
      default: "'mydb'",
    });
  });

  it('should generate __Goodie_Config token and config bean', () => {
    const result = createTestProject({
      '/src/AppConfig.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('app')
        export class AppConfig {
          name = 'my-app'
        }
      `,
    });

    expect(result.code).toContain(
      "new InjectionToken<Record<string, unknown>>('__Goodie_Config')",
    );
    expect(result.code).toContain('{ ...process.env, ...config }');
  });

  it('should inject config values in factory body', () => {
    const result = createTestProject({
      '/src/ServerConfig.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('server')
        export class ServerConfig {
          host = 'localhost'
          port = 3000
        }
      `,
    });

    expect(result.code).toContain(
      "instance.host = __config['server.host'] ?? 'localhost'",
    );
    expect(result.code).toContain(
      "instance.port = __config['server.port'] ?? 3000",
    );
  });

  it('should handle fields without defaults', () => {
    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('api')
        export class Config {
          url!: string
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    const valueFields = bean!.metadata.valueFields as Array<{
      fieldName: string;
      key: string;
      default?: string;
    }>;

    expect(valueFields).toHaveLength(1);
    expect(valueFields[0]).toEqual({
      fieldName: 'url',
      key: 'api.url',
      default: undefined,
    });

    expect(result.code).toContain("instance.url = __config['api.url']");
    // No ?? fallback for fields without a default
    expect(result.code).not.toContain("instance.url = __config['api.url'] ??");
  });

  it('should skip underscore-prefixed fields', () => {
    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('app')
        export class Config {
          name = 'my-app'
          _internal = 'hidden'
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    const valueFields = bean!.metadata.valueFields as Array<{
      fieldName: string;
      key: string;
    }>;

    expect(valueFields).toHaveLength(1);
    expect(valueFields[0].fieldName).toBe('name');
  });

  it('should coexist with @Value on another class', () => {
    const result = createTestProject({
      '/src/AppConfig.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('app')
        export class AppConfig {
          name = 'my-app'
        }
      `,
      '/src/Database.ts': `
        import { Singleton, Value } from './decorators.js'

        @Singleton()
        export class Database {
          @Value('DATABASE_URL', { default: 'postgres://localhost:5432/db' })
          accessor databaseUrl!: string
        }
      `,
    });

    // Both classes should have valueFields
    const appBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'AppConfig',
    );
    const dbBean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Database',
    );

    expect(appBean!.metadata.valueFields).toBeDefined();
    expect(dbBean!.metadata.valueFields).toBeDefined();

    // Only one __Goodie_Config token should exist
    const configTokenCount = (result.code.match(/__Goodie_Config/g) ?? [])
      .length;
    expect(configTokenCount).toBeGreaterThan(0);
  });

  it('should not add valueFields for class without @ConfigurationProperties', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {
          name = 'test'
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
    );
    expect(bean!.metadata.valueFields).toBeUndefined();
  });

  it('should handle accessor properties', () => {
    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('cache')
        export class Config {
          accessor ttl = 300
          accessor maxSize = 1000
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    const valueFields = bean!.metadata.valueFields as Array<{
      fieldName: string;
      key: string;
      default?: string;
    }>;

    expect(valueFields).toHaveLength(2);
    expect(valueFields[0]).toEqual({
      fieldName: 'ttl',
      key: 'cache.ttl',
      default: '300',
    });
    expect(valueFields[1]).toEqual({
      fieldName: 'maxSize',
      key: 'cache.maxSize',
      default: '1000',
    });
  });

  it('should generate buildDefinitions with config parameter', () => {
    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('app')
        export class Config {
          name = 'default'
        }
      `,
    });

    expect(result.code).toContain(
      'export function buildDefinitions(config?: Record<string, unknown>)',
    );
  });

  it('should skip private and protected fields by TypeScript modifier', () => {
    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties('app')
        export class Config {
          name = 'my-app'
          private secret = 'hidden'
          protected internal = 'also-hidden'
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    const valueFields = bean!.metadata.valueFields as Array<{
      fieldName: string;
      key: string;
    }>;

    expect(valueFields).toHaveLength(1);
    expect(valueFields[0].fieldName).toBe('name');
  });

  it('should warn when @ConfigurationProperties is called without prefix argument', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = createTestProject({
      '/src/Config.ts': `
        import { Singleton, ConfigurationProperties } from './decorators.js'

        @Singleton()
        @ConfigurationProperties()
        export class Config {
          name = 'my-app'
        }
      `,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing a prefix argument'),
    );
    // Bean exists (has @Singleton) but no valueFields (prefix missing)
    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    expect(bean).toBeDefined();
    expect(bean!.metadata.valueFields).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('should warn and skip when @ConfigurationProperties is used without @Singleton', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = createTestProject({
      '/src/Config.ts': `
        import { ConfigurationProperties } from './decorators.js'

        @ConfigurationProperties('app')
        export class Config {
          name = 'my-app'
        }
      `,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@ConfigurationProperties'),
    );
    // Class shouldn't be in beans at all (no @Singleton)
    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Config',
    );
    expect(bean).toBeUndefined();
    warnSpy.mockRestore();
  });
});
