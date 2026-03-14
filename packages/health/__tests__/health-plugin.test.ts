import type { IRComponentDefinition } from '@goodie-ts/transformer';
import {
  deserializeComponents,
  serializeComponents,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

const DECORATOR_STUBS = `
export function Transient() { return (t: any, c: any) => {} }
export function Singleton() { return (t: any, c: any) => {} }
`;

const HEALTH_IMPORT_PATH = '@goodie-ts/health';

const libraryBeans: IRComponentDefinition[] = [
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

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function findBean(
  beans: IRComponentDefinition[],
  className: string,
): IRComponentDefinition | undefined {
  return beans.find(
    (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === className,
  );
}

describe('Health Library Beans', () => {
  it('should include library beans in transform output', () => {
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
      [],
      libraryBeans,
    );

    const aggregator = findBean(result.beans, 'HealthAggregator');
    expect(aggregator).toBeDefined();
    expect(aggregator!.tokenRef).toEqual({
      kind: 'class',
      className: 'HealthAggregator',
      importPath: HEALTH_IMPORT_PATH,
    });
    expect(aggregator!.scope).toBe('singleton');

    // HealthAggregator should have a collection dep on HealthIndicator
    expect(aggregator!.constructorDeps).toHaveLength(1);
    const collectionDep = aggregator!.constructorDeps[0];
    expect(collectionDep.collection).toBe(true);
    expect(collectionDep.tokenRef).toEqual({
      kind: 'class',
      className: 'HealthIndicator',
      importPath: HEALTH_IMPORT_PATH,
    });
  });

  it('should include UptimeHealthIndicator with HealthIndicator base token from library beans', () => {
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
      [],
      libraryBeans,
    );

    const uptime = findBean(result.beans, 'UptimeHealthIndicator');
    expect(uptime).toBeDefined();
    expect(uptime!.tokenRef).toEqual({
      kind: 'class',
      className: 'UptimeHealthIndicator',
      importPath: HEALTH_IMPORT_PATH,
    });
    expect(uptime!.baseTokenRefs).toEqual([
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: HEALTH_IMPORT_PATH,
      },
    ]);
  });

  it('should not include library beans when none are provided', () => {
    const project = createProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(findBean(result.beans, 'HealthAggregator')).toBeUndefined();
    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeUndefined();
    expect(result.beans).toHaveLength(1);
  });

  it('should generate imports for health classes from library beans', () => {
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
      [],
      libraryBeans,
    );

    // Codegen auto-generates imports from bean tokenRefs and baseTokenRefs
    expect(result.code).toContain('HealthAggregator');
    expect(result.code).toContain('HealthIndicator');
    expect(result.code).toContain('UptimeHealthIndicator');
    expect(result.code).toContain("from '@goodie-ts/health'");
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      libraryBeans,
    );

    // DbIndicator + CacheIndicator + UptimeHealthIndicator + HealthAggregator
    expect(result.beans).toHaveLength(4);
    expect(findBean(result.beans, 'HealthAggregator')).toBeDefined();
    expect(findBean(result.beans, 'UptimeHealthIndicator')).toBeDefined();
  });

  it('should not create duplicate beans when library beans are present', () => {
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
      [],
      libraryBeans,
    );

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

  it('should round-trip library beans through serialize/deserialize', () => {
    const manifest = serializeComponents(libraryBeans, HEALTH_IMPORT_PATH);
    const roundTripped = deserializeComponents(manifest);

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
