import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IRBeanDefinition } from '../src/ir.js';
import {
  deserializeBeans,
  discoverAopMappings,
  discoverLibraryBeans,
  type LibraryBeansManifest,
  rewriteImportPaths,
  serializeBeans,
} from '../src/library-beans.js';
import { transformLibrary } from '../src/transform.js';

describe('serializeBeans / deserializeBeans', () => {
  it('should round-trip a simple class bean', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'MyService',
          importPath: '@acme/lib',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@acme/lib', line: 0, column: 0 },
      },
    ];

    const manifest = serializeBeans(beans, '@acme/lib');
    expect(manifest.version).toBe(1);
    expect(manifest.package).toBe('@acme/lib');

    const result = deserializeBeans(manifest);
    expect(result).toHaveLength(1);
    expect(result[0].tokenRef).toEqual(beans[0].tokenRef);
    expect(result[0].scope).toBe('singleton');
    expect(result[0].name).toBeUndefined();
    expect(result[0].providesSource).toBeUndefined();
    expect(result[0].baseTokenRefs).toBeUndefined();
  });

  it('should round-trip a bean with constructorDeps and baseTokenRefs', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'HealthAggregator',
          importPath: '@goodie-ts/health',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'HealthIndicator',
              importPath: '@goodie-ts/health',
            },
            optional: false,
            collection: true,
            sourceLocation: {
              filePath: '@goodie-ts/health',
              line: 0,
              column: 0,
            },
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: {
          filePath: '@goodie-ts/health',
          line: 0,
          column: 0,
        },
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'UptimeHealthIndicator',
          importPath: '@goodie-ts/health',
        },
        scope: 'singleton',
        eager: true,
        name: 'uptime',
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        baseTokenRefs: [
          {
            kind: 'class',
            className: 'HealthIndicator',
            importPath: '@goodie-ts/health',
          },
        ],
        metadata: { custom: 'value' },
        sourceLocation: {
          filePath: '@goodie-ts/health',
          line: 10,
          column: 5,
        },
      },
    ];

    const manifest = serializeBeans(beans, '@goodie-ts/health');
    const result = deserializeBeans(manifest);

    expect(result).toHaveLength(2);

    // Aggregator
    expect(result[0].constructorDeps).toHaveLength(1);
    expect(result[0].constructorDeps[0].collection).toBe(true);
    expect(result[0].baseTokenRefs).toBeUndefined();

    // UptimeHealthIndicator
    expect(result[1].eager).toBe(true);
    expect(result[1].name).toBe('uptime');
    expect(result[1].baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: '@goodie-ts/health',
      },
    ]);
    expect(result[1].metadata).toEqual({ custom: 'value' });
  });

  it('should handle typeImports Map <-> object conversion', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'myToken',
          importPath: '@acme/lib',
          typeAnnotation: 'Repository<User>',
          typeImports: new Map([
            ['Repository', '@acme/lib'],
            ['User', '@acme/models'],
          ]),
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@acme/lib', line: 0, column: 0 },
      },
    ];

    const manifest = serializeBeans(beans, '@acme/lib');

    // Verify serialized form has plain object, not Map
    const serializedToken = manifest.beans[0].tokenRef as Record<
      string,
      unknown
    >;
    expect(serializedToken.typeImports).toEqual({
      Repository: '@acme/lib',
      User: '@acme/models',
    });

    const result = deserializeBeans(manifest);
    const tokenRef = result[0].tokenRef;
    expect(tokenRef.kind).toBe('injection-token');
    if (tokenRef.kind === 'injection-token') {
      expect(tokenRef.typeImports).toBeInstanceOf(Map);
      expect(tokenRef.typeImports!.get('Repository')).toBe('@acme/lib');
      expect(tokenRef.typeImports!.get('User')).toBe('@acme/models');
    }
  });

  it('should handle undefined <-> null conversion for injection token fields', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'myToken',
          importPath: undefined,
          typeAnnotation: undefined,
          typeImports: undefined,
        },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: 'test', line: 0, column: 0 },
      },
    ];

    const manifest = serializeBeans(beans, 'test');

    // Verify null in serialized form
    const serializedToken = manifest.beans[0].tokenRef as Record<
      string,
      unknown
    >;
    expect(serializedToken.importPath).toBeNull();
    expect(serializedToken.typeAnnotation).toBeNull();
    expect(serializedToken.typeImports).toBeNull();

    const result = deserializeBeans(manifest);
    const tokenRef = result[0].tokenRef;
    if (tokenRef.kind === 'injection-token') {
      expect(tokenRef.importPath).toBeUndefined();
      expect(tokenRef.typeAnnotation).toBeUndefined();
      expect(tokenRef.typeImports).toBeUndefined();
    }
  });

  it('should reject unknown version with clear error', () => {
    const manifest: LibraryBeansManifest = {
      version: 99,
      package: '@acme/lib',
      beans: [],
    };

    expect(() => deserializeBeans(manifest)).toThrow(
      'Unsupported beans.json version 99 from package "@acme/lib"',
    );
  });

  it('should include aop section in manifest when provided', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'LoggingInterceptor',
          importPath: '@goodie-ts/logging',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@goodie-ts/logging', line: 0, column: 0 },
      },
    ];

    const aop = {
      Log: { interceptor: 'LoggingInterceptor', order: -100 },
    };

    const manifest = serializeBeans(beans, '@goodie-ts/logging', aop);
    expect(manifest.aop).toEqual(aop);
    expect(manifest.beans).toHaveLength(1);
  });

  it('should omit aop section when no aop mappings exist', () => {
    const beans: IRBeanDefinition[] = [];
    const manifest = serializeBeans(beans, '@acme/lib');
    expect(manifest.aop).toBeUndefined();
  });
});

describe('discoverLibraryBeans', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodie-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should skip packages without goodie.beans field', async () => {
    // Create a package with only a plugin field (no beans)
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'some-pkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/some-pkg',
        goodie: { plugin: 'dist/plugin.js' },
      }),
    );

    const beans = await discoverLibraryBeans(tmpDir);
    expect(beans).toEqual([]);
  });

  it('should discover and deserialize beans from packages with goodie.beans field', async () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'health');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/health',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    const manifest: LibraryBeansManifest = {
      version: 1,
      package: '@goodie-ts/health',
      beans: [
        {
          tokenRef: {
            kind: 'class',
            className: 'UptimeHealthIndicator',
            importPath: '@goodie-ts/health',
          },
          scope: 'singleton',
          eager: false,
          name: null,
          constructorDeps: [],
          fieldDeps: [],
          factoryKind: 'constructor',
          providesSource: null,
          baseTokenRefs: [
            {
              kind: 'class',
              className: 'HealthIndicator',
              importPath: '@goodie-ts/health',
            },
          ],
          metadata: {},
          sourceLocation: {
            filePath: '@goodie-ts/health',
            line: 0,
            column: 0,
          },
        },
      ],
    };

    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'beans.json'),
      JSON.stringify(manifest),
    );

    const beans = await discoverLibraryBeans(tmpDir);
    expect(beans).toHaveLength(1);
    expect(beans[0].tokenRef).toEqual({
      kind: 'class',
      className: 'UptimeHealthIndicator',
      importPath: '@goodie-ts/health',
    });
    expect(beans[0].baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: '@goodie-ts/health',
      },
    ]);
  });

  it('should scan custom scopes', async () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'my-lib');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@acme/my-lib',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    const manifest: LibraryBeansManifest = {
      version: 1,
      package: '@acme/my-lib',
      beans: [
        {
          tokenRef: {
            kind: 'class',
            className: 'AcmeService',
            importPath: '@acme/my-lib',
          },
          scope: 'singleton',
          eager: false,
          name: null,
          constructorDeps: [],
          fieldDeps: [],
          factoryKind: 'constructor',
          providesSource: null,
          metadata: {},
          sourceLocation: {
            filePath: '@acme/my-lib',
            line: 0,
            column: 0,
          },
        },
      ],
    };

    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'beans.json'),
      JSON.stringify(manifest),
    );

    // Only scan @acme, not @goodie-ts
    const beans = await discoverLibraryBeans(tmpDir, ['@acme']);
    expect(beans).toHaveLength(1);
    expect(beans[0].tokenRef).toEqual({
      kind: 'class',
      className: 'AcmeService',
      importPath: '@acme/my-lib',
    });
  });

  it('should warn on malformed beans.json and continue', async () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'broken');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/broken',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    // Write invalid JSON
    fs.writeFileSync(path.join(pkgDir, 'dist', 'beans.json'), '{ invalid }');

    const beans = await discoverLibraryBeans(tmpDir);
    expect(beans).toEqual([]);
  });

  it('should return empty array when node_modules does not exist', async () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    const beans = await discoverLibraryBeans(nonExistent);
    expect(beans).toEqual([]);
  });
});

describe('discoverAopMappings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodie-aop-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should discover aop mappings from beans.json manifest', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'logging');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/logging',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    const manifest: LibraryBeansManifest = {
      version: 1,
      package: '@goodie-ts/logging',
      beans: [],
      aop: {
        Log: { interceptor: 'LoggingInterceptor', order: -100 },
      },
    };

    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'beans.json'),
      JSON.stringify(manifest),
    );

    const mappings = discoverAopMappings(tmpDir);
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual({
      decoratorName: 'Log',
      declaration: { interceptor: 'LoggingInterceptor', order: -100 },
      packageName: '@goodie-ts/logging',
    });
  });

  it('should skip packages without beans field', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'core');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@goodie-ts/core' }),
    );

    const mappings = discoverAopMappings(tmpDir);
    expect(mappings).toEqual([]);
  });

  it('should skip manifests without aop section', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'health');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/health',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    const manifest: LibraryBeansManifest = {
      version: 1,
      package: '@goodie-ts/health',
      beans: [],
    };

    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'beans.json'),
      JSON.stringify(manifest),
    );

    const mappings = discoverAopMappings(tmpDir);
    expect(mappings).toEqual([]);
  });

  it('should discover multiple decorators from one package', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'cache');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/cache',
        goodie: { beans: 'dist/beans.json' },
      }),
    );

    const manifest: LibraryBeansManifest = {
      version: 1,
      package: '@goodie-ts/cache',
      beans: [],
      aop: {
        Cacheable: {
          interceptor: 'CacheInterceptor',
          order: -50,
          metadata: { cacheAction: 'get' },
          argMapping: ['cacheName'],
        },
        CacheEvict: {
          interceptor: 'CacheInterceptor',
          order: -50,
          metadata: { cacheAction: 'evict' },
          argMapping: ['cacheName'],
        },
      },
    };

    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'beans.json'),
      JSON.stringify(manifest),
    );

    const mappings = discoverAopMappings(tmpDir);
    expect(mappings).toHaveLength(2);
    const names = mappings.map((m) => m.decoratorName).sort();
    expect(names).toEqual(['CacheEvict', 'Cacheable']);
  });

  it('should return empty array when beans.json is malformed', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@goodie-ts', 'broken');
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@goodie-ts/broken',
        goodie: { beans: 'dist/beans.json' },
      }),
    );
    fs.writeFileSync(path.join(pkgDir, 'dist', 'beans.json'), '{ invalid }');

    const mappings = discoverAopMappings(tmpDir);
    expect(mappings).toEqual([]);
  });
});

describe('rewriteImportPaths', () => {
  it('should rewrite absolute paths to bare package specifiers', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'MyService',
          importPath: '/home/user/project/src/my-service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'Dep',
              importPath: '/home/user/project/src/dep.ts',
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '/home/user/project/src/dep.ts',
              line: 1,
              column: 0,
            },
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        baseTokenRefs: [
          {
            kind: 'class',
            className: 'Base',
            importPath: '/home/user/project/src/base.ts',
          },
        ],
        metadata: {},
        sourceLocation: {
          filePath: '/home/user/project/src/my-service.ts',
          line: 1,
          column: 0,
        },
      },
    ];

    const result = rewriteImportPaths(
      beans,
      '@acme/my-lib',
      '/home/user/project/src',
    );

    expect(result[0].tokenRef).toEqual({
      kind: 'class',
      className: 'MyService',
      importPath: '@acme/my-lib',
    });
    expect(result[0].constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'Dep',
      importPath: '@acme/my-lib',
    });
    expect(result[0].constructorDeps[0].sourceLocation.filePath).toBe(
      '@acme/my-lib',
    );
    expect(result[0].baseTokenRefs![0]).toEqual({
      kind: 'class',
      className: 'Base',
      importPath: '@acme/my-lib',
    });
    expect(result[0].sourceLocation.filePath).toBe('@acme/my-lib');
  });

  it('should not rewrite paths that do not match sourceRoot', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'ExternalDep',
          importPath: '@other/lib',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@other/lib', line: 0, column: 0 },
      },
    ];

    const result = rewriteImportPaths(
      beans,
      '@acme/my-lib',
      '/home/user/project/src',
    );

    expect(result[0].tokenRef).toEqual({
      kind: 'class',
      className: 'ExternalDep',
      importPath: '@other/lib',
    });
  });
});

describe('transformLibrary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodie-lib-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFiles(files: Record<string, string>) {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tmpDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  it('should scan decorated source and produce a beans.json manifest', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/my-service.ts': `
import { Singleton } from './decorators.js'

@Singleton()
export class MyService {
  hello() { return 'world' }
}
      `,
    });

    const beansOutputPath = path.join(tmpDir, 'dist', 'beans.json');
    const result = await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/my-lib',
      beansOutputPath,
      disablePluginDiscovery: true,
    });

    // Should have discovered MyService
    expect(result.beans).toHaveLength(1);
    expect(result.beans[0].tokenRef).toEqual({
      kind: 'class',
      className: 'MyService',
      importPath: '@acme/my-lib',
    });
    expect(result.beans[0].sourceLocation.filePath).toBe('@acme/my-lib');

    // Manifest should be written to disk
    expect(fs.existsSync(beansOutputPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(beansOutputPath, 'utf-8'));
    expect(written.version).toBe(1);
    expect(written.package).toBe('@acme/my-lib');
    expect(written.beans).toHaveLength(1);
  });

  it('should rewrite import paths including constructor dep sourceLocations', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/dep.ts': `
import { Singleton } from './decorators.js'

@Singleton()
export class Dep {}
      `,
      'src/consumer.ts': `
import { Singleton } from './decorators.js'
import { Dep } from './dep.js'

@Singleton()
export class Consumer {
  constructor(private dep: Dep) {}
}
      `,
    });

    const result = await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/my-lib',
      beansOutputPath: path.join(tmpDir, 'dist', 'beans.json'),
      disablePluginDiscovery: true,
    });

    const consumer = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Consumer',
    );
    expect(consumer).toBeDefined();

    // Token ref should be rewritten
    expect(consumer!.tokenRef).toEqual({
      kind: 'class',
      className: 'Consumer',
      importPath: '@acme/my-lib',
    });

    // Constructor dep token ref and sourceLocation should be rewritten
    expect(consumer!.constructorDeps).toHaveLength(1);
    expect(consumer!.constructorDeps[0].tokenRef).toEqual({
      kind: 'class',
      className: 'Dep',
      importPath: '@acme/my-lib',
    });
    expect(consumer!.constructorDeps[0].sourceLocation.filePath).toBe(
      '@acme/my-lib',
    );
  });

  it('should produce a manifest that round-trips through deserialize', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/service.ts': `
import { Singleton } from './decorators.js'

@Singleton()
export class Service {}
      `,
    });

    const beansOutputPath = path.join(tmpDir, 'dist', 'beans.json');
    await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/lib',
      beansOutputPath,
      disablePluginDiscovery: true,
    });

    // Read manifest from disk and deserialize
    const manifest: LibraryBeansManifest = JSON.parse(
      fs.readFileSync(beansOutputPath, 'utf-8'),
    );
    const beans = deserializeBeans(manifest);

    expect(beans).toHaveLength(1);
    expect(beans[0].tokenRef).toEqual({
      kind: 'class',
      className: 'Service',
      importPath: '@acme/lib',
    });
  });

  it('should emit generated code when codeOutputPath is set', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/my-service.ts': `
import { Singleton } from './decorators.js'

@Singleton()
export class MyService {
  hello() { return 'world' }
}
      `,
    });

    const beansOutputPath = path.join(tmpDir, 'dist', 'beans.json');
    const codeOutputPath = path.join(tmpDir, 'src', 'AppContext.generated.ts');
    const result = await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/my-lib',
      beansOutputPath,
      codeOutputPath,
      disablePluginDiscovery: true,
    });

    // beans.json should be written
    expect(fs.existsSync(beansOutputPath)).toBe(true);

    // Generated code should be written
    expect(fs.existsSync(codeOutputPath)).toBe(true);
    expect(result.code).toBeDefined();
    expect(result.codeOutputPath).toBe(codeOutputPath);

    // Generated code should contain bean definitions
    const code = fs.readFileSync(codeOutputPath, 'utf-8');
    expect(code).toContain('MyService');
    expect(code).toContain('BeanDefinition');
  });

  it('should not emit code when codeOutputPath is omitted', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/service.ts': `
import { Singleton } from './decorators.js'

@Singleton()
export class Service {}
      `,
    });

    const result = await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/lib',
      beansOutputPath: path.join(tmpDir, 'dist', 'beans.json'),
      disablePluginDiscovery: true,
    });

    expect(result.code).toBeUndefined();
    expect(result.codeOutputPath).toBeUndefined();
  });

  it('should detect base classes and set baseTokenRefs', async () => {
    writeFiles({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
      }),
      'src/decorators.ts': `
export function Singleton() { return (t: any, c: any) => {} }
      `,
      'src/base.ts': `
export abstract class BaseService {
  abstract doWork(): void
}
      `,
      'src/impl.ts': `
import { Singleton } from './decorators.js'
import { BaseService } from './base.js'

@Singleton()
export class ImplService extends BaseService {
  doWork() {}
}
      `,
    });

    const result = await transformLibrary({
      tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      packageName: '@acme/lib',
      beansOutputPath: path.join(tmpDir, 'dist', 'beans.json'),
      disablePluginDiscovery: true,
    });

    const impl = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' && b.tokenRef.className === 'ImplService',
    );
    expect(impl).toBeDefined();
    expect(impl!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'BaseService',
        importPath: '@acme/lib',
      },
    ]);
  });
});
