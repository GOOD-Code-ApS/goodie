import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { transformInMemory } from '../src/transform.js';
import { DECORATOR_STUBS } from './helpers.js';

function createTestProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });

  if (!files['/src/decorators.ts']) {
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  }

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, '/out/AppContext.generated.ts');
}

describe('Conditional Plugin — Metadata Recording', () => {
  describe('@ConditionalOnEnv', () => {
    it('should record conditionalRules in metadata', () => {
      const result = createTestProject({
        '/src/ProdService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          export class ProdService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'ProdService',
      );
      expect(component).toBeDefined();
      expect(component!.metadata.conditionalRules).toEqual([
        { type: 'onEnv', envVar: 'NODE_ENV', expectedValue: 'production' },
      ]);
    });

    it('should record existence-only check', () => {
      const result = createTestProject({
        '/src/FeatureService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('FEATURE_FLAG')
          export class FeatureService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FeatureService',
      );
      expect(component!.metadata.conditionalRules).toEqual([
        { type: 'onEnv', envVar: 'FEATURE_FLAG' },
      ]);
    });
  });

  describe('@ConditionalOnProperty', () => {
    it('should record havingValue as expectedValue', () => {
      const result = createTestProject({
        '/src/PgService.ts': `
          import { Singleton, ConditionalOnProperty } from './decorators.js'

          @Singleton()
          @ConditionalOnProperty('datasource.dialect', { havingValue: 'postgres' })
          export class PgService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'PgService',
      );
      expect(component!.metadata.conditionalRules).toEqual([
        {
          type: 'onProperty',
          key: 'datasource.dialect',
          expectedValue: 'postgres',
        },
      ]);
    });

    it('should record havingValue array as expectedValues', () => {
      const result = createTestProject({
        '/src/ConnStringDb.ts': `
          import { Singleton, ConditionalOnProperty } from './decorators.js'

          @Singleton()
          @ConditionalOnProperty('datasource.dialect', { havingValue: ['postgres', 'mysql'] })
          export class ConnStringDb {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'ConnStringDb',
      );
      expect(component!.metadata.conditionalRules).toEqual([
        {
          type: 'onProperty',
          key: 'datasource.dialect',
          expectedValues: ['postgres', 'mysql'],
        },
      ]);
    });

    it('should record existence-only property check', () => {
      const result = createTestProject({
        '/src/DbService.ts': `
          import { Singleton, ConditionalOnProperty } from './decorators.js'

          @Singleton()
          @ConditionalOnProperty('datasource.url')
          export class DbService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'DbService',
      );
      expect(component!.metadata.conditionalRules).toEqual([
        { type: 'onProperty', key: 'datasource.url' },
      ]);
    });
  });

  describe('@ConditionalOnMissing', () => {
    it('should record onMissing rule with resolved class info', () => {
      const result = createTestProject({
        '/src/ServiceA.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class ServiceA {}
        `,
        '/src/FallbackService.ts': `
          import { Singleton, ConditionalOnMissing } from './decorators.js'
          import { ServiceA } from './ServiceA.js'

          @Singleton()
          @ConditionalOnMissing(ServiceA)
          export class FallbackService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FallbackService',
      );
      expect(component).toBeDefined();
      const rules = component!.metadata.conditionalRules as Array<{
        type: string;
        tokenClassName: string;
      }>;
      expect(rules).toHaveLength(1);
      expect(rules[0].type).toBe('onMissing');
      expect(rules[0].tokenClassName).toBe('ServiceA');
    });
  });

  describe('Multiple conditions', () => {
    it('should record multiple rules (AND logic)', () => {
      const result = createTestProject({
        '/src/MultiCondService.ts': `
          import { Singleton, ConditionalOnEnv, ConditionalOnProperty } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          @ConditionalOnProperty('feature.enabled', 'true')
          export class MultiCondService {}
        `,
      });

      const component = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'MultiCondService',
      );
      expect(component!.metadata.conditionalRules).toEqual([
        { type: 'onEnv', envVar: 'NODE_ENV', expectedValue: 'production' },
        { type: 'onProperty', key: 'feature.enabled', expectedValue: 'true' },
      ]);
    });
  });

  describe('All components pass through graph builder', () => {
    it('should include conditional components in output (filtering deferred to runtime)', () => {
      const result = createTestProject({
        '/src/ProdService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          export class ProdService {}
        `,
        '/src/DevService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'development')
          export class DevService {}
        `,
      });

      // Both components should be in the output — runtime will filter
      const prod = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'ProdService',
      );
      const dev = result.components.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'DevService',
      );
      expect(prod).toBeDefined();
      expect(dev).toBeDefined();
    });
  });
});
