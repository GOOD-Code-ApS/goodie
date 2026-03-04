import type { IRBeanDefinition } from '@goodie-ts/transformer';
import {
  deserializeBeans,
  serializeBeans,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { createHealthPlugin } from '../src/health-transformer-plugin.js';

const DECORATOR_STUBS = `
export function Injectable() { return (t: any, c: any) => {} }
export function Singleton() { return (t: any, c: any) => {} }
`;

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function findBean(
  beans: IRBeanDefinition[],
  className: string,
): IRBeanDefinition | undefined {
  return beans.find(
    (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === className,
  );
}

describe('Health Transformer Plugin', () => {
  it('should inject HealthAggregator and UptimeHealthIndicator when indicator subtypes exist', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    const aggregator = findBean(result.beans, 'HealthAggregator');
    expect(aggregator).toBeDefined();
    expect(aggregator!.tokenRef).toEqual({
      kind: 'class',
      className: 'HealthAggregator',
      importPath: '@goodie-ts/health',
    });
    expect(aggregator!.scope).toBe('singleton');

    // HealthAggregator should have a collection dep on HealthIndicator
    expect(aggregator!.constructorDeps).toHaveLength(1);
    const collectionDep = aggregator!.constructorDeps[0];
    expect(collectionDep.collection).toBe(true);
    expect(collectionDep.tokenRef).toEqual({
      kind: 'class',
      className: 'HealthIndicator',
      importPath: '@goodie-ts/health',
    });
  });

  it('should inject synthetic UptimeHealthIndicator with HealthIndicator base token', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    const uptime = findBean(result.beans, 'UptimeHealthIndicator');
    expect(uptime).toBeDefined();
    expect(uptime!.tokenRef).toEqual({
      kind: 'class',
      className: 'UptimeHealthIndicator',
      importPath: '@goodie-ts/health',
    });
    expect(uptime!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: '@goodie-ts/health',
      },
    ]);
  });

  it('should not inject any beans when no HealthIndicator subtypes exist', () => {
    const project = createProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    expect(findBean(result.beans, 'HealthAggregator')).toBeUndefined();
    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeUndefined();
    expect(result.beans).toHaveLength(1);
  });

  it('should contribute imports for health classes in generated code', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    expect(result.code).toContain(
      "import { HealthAggregator, HealthIndicator, UptimeHealthIndicator } from '@goodie-ts/health'",
    );
  });

  it('should work with multiple indicator subtypes', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
      '/src/CacheIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class CacheIndicator extends HealthIndicator {
          readonly name = 'cache'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    // DbIndicator + CacheIndicator + UptimeHealthIndicator + HealthAggregator
    expect(result.beans).toHaveLength(4);
    expect(findBean(result.beans, 'HealthAggregator')).toBeDefined();
    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeDefined();
  });
});

describe('Health Plugin with Library Beans', () => {
  const HEALTH_IMPORT_PATH = '@goodie-ts/health';

  const libraryBeans: IRBeanDefinition[] = [
    {
      tokenRef: {
        kind: 'class',
        className: 'UptimeHealthIndicator',
        importPath: HEALTH_IMPORT_PATH,
      },
      scope: 'singleton',
      eager: false,
      name: undefined,
      constructorDeps: [],
      fieldDeps: [],
      factoryKind: 'constructor',
      providesSource: undefined,
      baseTokenRefs: [
        {
          kind: 'class',
          className: 'HealthIndicator',
          importPath: HEALTH_IMPORT_PATH,
        },
      ],
      metadata: {},
      sourceLocation: {
        filePath: HEALTH_IMPORT_PATH,
        line: 0,
        column: 0,
      },
    },
    {
      tokenRef: {
        kind: 'class',
        className: 'HealthAggregator',
        importPath: HEALTH_IMPORT_PATH,
      },
      scope: 'singleton',
      eager: false,
      name: undefined,
      constructorDeps: [
        {
          tokenRef: {
            kind: 'class',
            className: 'HealthIndicator',
            importPath: HEALTH_IMPORT_PATH,
          },
          optional: false,
          collection: true,
          sourceLocation: {
            filePath: HEALTH_IMPORT_PATH,
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
        filePath: HEALTH_IMPORT_PATH,
        line: 0,
        column: 0,
      },
    },
  ];

  it('should skip synthesis when library beans already provide health beans', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    // Pass library beans via transformInMemory
    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createHealthPlugin()],
      libraryBeans,
    );

    // Should have: DbIndicator + UptimeHealthIndicator + HealthAggregator (from library)
    // Plugin should NOT add duplicates
    const uptimeBeans = result.beans.filter(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UptimeHealthIndicator',
    );
    const aggregatorBeans = result.beans.filter(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'HealthAggregator',
    );

    expect(uptimeBeans).toHaveLength(1);
    expect(aggregatorBeans).toHaveLength(1);
  });

  it('should include library beans in transformInMemory output', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createHealthPlugin()],
      libraryBeans,
    );

    // Library beans should be in the output
    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeDefined();
    expect(findBean(result.beans, 'HealthAggregator')).toBeDefined();
    expect(findBean(result.beans, 'DbIndicator')).toBeDefined();
  });

  it('should still synthesize beans without library beans (backward compat)', () => {
    const project = createProject({
      '/src/HealthIndicator.ts': `
        export abstract class HealthIndicator {
          abstract readonly name: string
          abstract check(): Promise<{ status: string }>
        }
      `,
      '/src/DbIndicator.ts': `
        import { Singleton } from './decorators.js'
        import { HealthIndicator } from './HealthIndicator.js'

        @Singleton()
        export class DbIndicator extends HealthIndicator {
          readonly name = 'db'
          async check() { return { status: 'UP' } }
        }
      `,
    });

    // No library beans — plugin should synthesize as before
    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHealthPlugin(),
    ]);

    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeDefined();
    expect(findBean(result.beans, 'HealthAggregator')).toBeDefined();
    expect(result.beans).toHaveLength(3);
  });

  it('should round-trip library beans through serialize/deserialize', () => {
    const manifest = serializeBeans(libraryBeans, HEALTH_IMPORT_PATH);
    const roundTripped = deserializeBeans(manifest);

    expect(roundTripped).toHaveLength(2);

    const uptime = roundTripped.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UptimeHealthIndicator',
    );
    expect(uptime).toBeDefined();
    expect(uptime!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: HEALTH_IMPORT_PATH,
      },
    ]);

    const aggregator = roundTripped.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'HealthAggregator',
    );
    expect(aggregator).toBeDefined();
    expect(aggregator!.constructorDeps[0].collection).toBe(true);
  });
});
