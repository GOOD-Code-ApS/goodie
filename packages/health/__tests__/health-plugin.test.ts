import type { IRBeanDefinition } from '@goodie-ts/transformer';
import { transformInMemory } from '@goodie-ts/transformer';
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
