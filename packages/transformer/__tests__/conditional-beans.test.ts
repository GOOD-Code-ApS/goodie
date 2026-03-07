import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transformInMemory } from '../src/transform.js';
import { MissingProviderError } from '../src/transformer-errors.js';
import { DECORATOR_STUBS } from './helpers.js';

function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
  options?: { configDir?: string },
) {
  const project = new Project({ useInMemoryFileSystem: true });

  if (!files['/src/decorators.ts']) {
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  }

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(
    project,
    outputPath,
    undefined,
    undefined,
    undefined,
    options,
  );
}

describe('Conditional Bean Registration', () => {
  describe('@ConditionalOnEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should include bean when env var matches expected value', () => {
      process.env.NODE_ENV = 'production';

      const result = createTestProject({
        '/src/ProdService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          export class ProdService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'ProdService',
      );
      expect(bean).toBeDefined();
    });

    it('should exclude bean when env var does not match expected value', () => {
      process.env.NODE_ENV = 'development';

      const result = createTestProject({
        '/src/ProdService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          export class ProdService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'ProdService',
      );
      expect(bean).toBeUndefined();
    });

    it('should include bean when env var exists (no value check)', () => {
      process.env.FEATURE_FLAG = 'anything';

      const result = createTestProject({
        '/src/FeatureService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('FEATURE_FLAG')
          export class FeatureService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FeatureService',
      );
      expect(bean).toBeDefined();
    });

    it('should exclude bean when env var is missing (no value check)', () => {
      delete process.env.FEATURE_FLAG;

      const result = createTestProject({
        '/src/FeatureService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('FEATURE_FLAG')
          export class FeatureService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FeatureService',
      );
      expect(bean).toBeUndefined();
    });
  });

  describe('@ConditionalOnMissingBean', () => {
    it('should exclude bean when target bean exists', () => {
      const result = createTestProject({
        '/src/ServiceA.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class ServiceA {}
        `,
        '/src/FallbackService.ts': `
          import { Singleton, ConditionalOnMissingBean } from './decorators.js'
          import { ServiceA } from './ServiceA.js'

          @Singleton()
          @ConditionalOnMissingBean(ServiceA)
          export class FallbackService {}
        `,
      });

      const fallback = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FallbackService',
      );
      expect(fallback).toBeUndefined();

      const serviceA = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'ServiceA',
      );
      expect(serviceA).toBeDefined();
    });

    it('should include bean when target bean does not exist', () => {
      const result = createTestProject({
        '/src/ServiceA.ts': `
          export class ServiceA {}
        `,
        '/src/FallbackService.ts': `
          import { Singleton, ConditionalOnMissingBean } from './decorators.js'
          import { ServiceA } from './ServiceA.js'

          @Singleton()
          @ConditionalOnMissingBean(ServiceA)
          export class FallbackService {}
        `,
      });

      const fallback = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FallbackService',
      );
      expect(fallback).toBeDefined();
    });
  });

  describe('Error handling', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw MissingProviderError with hint when required dep was filtered out', () => {
      process.env.NODE_ENV = 'development';

      expect.assertions(3);

      try {
        createTestProject({
          '/src/ProdService.ts': `
            import { Singleton, ConditionalOnEnv } from './decorators.js'

            @Singleton()
            @ConditionalOnEnv('NODE_ENV', 'production')
            export class ProdService {}
          `,
          '/src/Consumer.ts': `
            import { Singleton } from './decorators.js'
            import { ProdService } from './ProdService.js'

            @Singleton()
            export class Consumer {
              constructor(private prodService: ProdService) {}
            }
          `,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(MissingProviderError);
        expect((e as MissingProviderError).message).toContain(
          'excluded by a conditional rule',
        );
        expect((e as MissingProviderError).message).toContain(
          '@ConditionalOnEnv',
        );
      }
    });
  });

  describe('Multiple conditions (AND logic)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should include bean only when all conditions are met', () => {
      process.env.NODE_ENV = 'production';
      process.env.FEATURE_FLAG = 'enabled';

      const result = createTestProject({
        '/src/MultiCondService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          @ConditionalOnEnv('FEATURE_FLAG')
          export class MultiCondService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'MultiCondService',
      );
      expect(bean).toBeDefined();
    });

    it('should exclude bean when any condition fails', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.FEATURE_FLAG;

      const result = createTestProject({
        '/src/MultiCondService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('NODE_ENV', 'production')
          @ConditionalOnEnv('FEATURE_FLAG')
          export class MultiCondService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'MultiCondService',
      );
      expect(bean).toBeUndefined();
    });
  });

  describe('@ConditionalOnEnv with empty string value', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should include bean when env var is set to empty string and only existence is checked', () => {
      process.env.FEATURE_FLAG = '';

      const result = createTestProject({
        '/src/EmptyEnvService.ts': `
          import { Singleton, ConditionalOnEnv } from './decorators.js'

          @Singleton()
          @ConditionalOnEnv('FEATURE_FLAG')
          export class EmptyEnvService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'EmptyEnvService',
      );
      // Empty string is defined, so bean should be included
      expect(bean).toBeDefined();
    });
  });

  describe('@ConditionalOnProperty', () => {
    let configDir: string;

    beforeEach(() => {
      configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodie-test-'));
    });

    afterEach(() => {
      fs.rmSync(configDir, { recursive: true, force: true });
    });

    it('should include bean when property matches expected value', () => {
      fs.writeFileSync(
        path.join(configDir, 'default.json'),
        JSON.stringify({ feature: { enabled: 'true' } }),
      );

      const result = createTestProject(
        {
          '/src/FeatureService.ts': `
            import { Singleton, ConditionalOnProperty } from './decorators.js'

            @Singleton()
            @ConditionalOnProperty('feature.enabled', 'true')
            export class FeatureService {}
          `,
        },
        '/out/AppContext.generated.ts',
        { configDir },
      );

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FeatureService',
      );
      expect(bean).toBeDefined();
    });

    it('should exclude bean when property does not match expected value', () => {
      fs.writeFileSync(
        path.join(configDir, 'default.json'),
        JSON.stringify({ feature: { enabled: 'false' } }),
      );

      const result = createTestProject(
        {
          '/src/FeatureService.ts': `
            import { Singleton, ConditionalOnProperty } from './decorators.js'

            @Singleton()
            @ConditionalOnProperty('feature.enabled', 'true')
            export class FeatureService {}
          `,
        },
        '/out/AppContext.generated.ts',
        { configDir },
      );

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'FeatureService',
      );
      expect(bean).toBeUndefined();
    });

    it('should include bean when property exists (no value check)', () => {
      fs.writeFileSync(
        path.join(configDir, 'default.json'),
        JSON.stringify({ datasource: { url: 'postgres://localhost' } }),
      );

      const result = createTestProject(
        {
          '/src/DbService.ts': `
            import { Singleton, ConditionalOnProperty } from './decorators.js'

            @Singleton()
            @ConditionalOnProperty('datasource.url')
            export class DbService {}
          `,
        },
        '/out/AppContext.generated.ts',
        { configDir },
      );

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'DbService',
      );
      expect(bean).toBeDefined();
    });

    it('should exclude bean when property is absent', () => {
      fs.writeFileSync(
        path.join(configDir, 'default.json'),
        JSON.stringify({}),
      );

      const result = createTestProject(
        {
          '/src/DbService.ts': `
            import { Singleton, ConditionalOnProperty } from './decorators.js'

            @Singleton()
            @ConditionalOnProperty('datasource.url')
            export class DbService {}
          `,
        },
        '/out/AppContext.generated.ts',
        { configDir },
      );

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'DbService',
      );
      expect(bean).toBeUndefined();
    });

    it('should coerce non-string property values with String() for comparison', () => {
      fs.writeFileSync(
        path.join(configDir, 'default.json'),
        JSON.stringify({ feature: { retries: 3 } }),
      );

      const result = createTestProject(
        {
          '/src/RetryService.ts': `
            import { Singleton, ConditionalOnProperty } from './decorators.js'

            @Singleton()
            @ConditionalOnProperty('feature.retries', '3')
            export class RetryService {}
          `,
        },
        '/out/AppContext.generated.ts',
        { configDir },
      );

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'RetryService',
      );
      expect(bean).toBeDefined();
    });
  });

  describe('Unconditional beans unaffected', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should not filter beans without conditional decorators', () => {
      delete process.env.SOME_VAR;

      const result = createTestProject({
        '/src/RegularService.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class RegularService {}
        `,
      });

      const bean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'RegularService',
      );
      expect(bean).toBeDefined();
    });
  });
});
