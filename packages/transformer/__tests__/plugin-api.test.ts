import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import type { IRBeanDefinition } from '../src/ir.js';
import type { TransformerPlugin } from '../src/options.js';
import { transformInMemory } from '../src/transform.js';
import { DECORATOR_STUBS } from './helpers.js';

describe('TransformerPlugin API', () => {
  function createProject(files: Record<string, string>) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    for (const [path, content] of Object.entries(files)) {
      project.createSourceFile(path, content);
    }
    return project;
  }

  describe('visitClass', () => {
    it('is called for each decorated class', () => {
      const visited: string[] = [];
      const plugin: TransformerPlugin = {
        name: 'test-visit-class',
        visitClass(ctx) {
          visited.push(ctx.className);
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
        '/src/Bar.ts': `
          import { Injectable } from './decorators.js'
          @Injectable()
          export class Bar {}
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(visited).toContain('Foo');
      expect(visited).toContain('Bar');
      expect(visited).toHaveLength(2);
    });

    it('is not called for undecorated classes', () => {
      const visited: string[] = [];
      const plugin: TransformerPlugin = {
        name: 'test-skip-undecorated',
        visitClass(ctx) {
          visited.push(ctx.className);
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
        '/src/Plain.ts': `
          export class Plain {}
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(visited).toContain('Foo');
      expect(visited).not.toContain('Plain');
    });

    it('provides filePath and classDeclaration in context', () => {
      let capturedFilePath: string | undefined;
      let hasDeclaration = false;
      const plugin: TransformerPlugin = {
        name: 'test-ctx',
        visitClass(ctx) {
          if (ctx.className === 'Foo') {
            capturedFilePath = ctx.filePath;
            hasDeclaration = ctx.classDeclaration !== undefined;
          }
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(capturedFilePath).toBe('/src/Foo.ts');
      expect(hasDeclaration).toBe(true);
    });
  });

  describe('visitMethod', () => {
    it('is called for each method on decorated classes', () => {
      const visitedMethods: string[] = [];
      const plugin: TransformerPlugin = {
        name: 'test-visit-method',
        visitMethod(ctx) {
          visitedMethods.push(`${ctx.className}.${ctx.methodName}`);
        },
      };

      const project = createProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Service {
            doWork() {}
            cleanup() {}
          }
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(visitedMethods).toContain('Service.doWork');
      expect(visitedMethods).toContain('Service.cleanup');
    });

    it('shares classMetadata with visitClass', () => {
      let methodSawMetadata = false;
      const plugin: TransformerPlugin = {
        name: 'test-shared-metadata',
        visitClass(ctx) {
          ctx.metadata.visited = true;
        },
        visitMethod(ctx) {
          if (ctx.classMetadata.visited === true) {
            methodSawMetadata = true;
          }
        },
      };

      const project = createProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Service {
            doWork() {}
          }
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(methodSawMetadata).toBe(true);
    });
  });

  describe('afterResolve', () => {
    it('can see visitor metadata from visitClass', () => {
      const plugin: TransformerPlugin = {
        name: 'test-visitor-metadata-in-afterResolve',
        visitClass(ctx) {
          ctx.metadata.myTag = 'tagged';
        },
        afterResolve(beans) {
          // Visitor metadata should already be merged at this point
          return beans.filter((b) => b.metadata.myTag === 'tagged');
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      // If metadata wasn't merged before afterResolve, the filter would
      // remove all beans and the result would be empty
      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].metadata.myTag).toBe('tagged');
    });

    it('can mutate IR bean metadata', () => {
      const plugin: TransformerPlugin = {
        name: 'test-after-resolve',
        afterResolve(beans) {
          for (const bean of beans) {
            bean.metadata.customFlag = true;
          }
          return beans;
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      expect(result.beans[0].metadata.customFlag).toBe(true);
      expect(result.code).toContain('customFlag: true');
    });
  });

  describe('beforeCodegen', () => {
    it('can inject additional beans into the final list', () => {
      const syntheticBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'Foo',
          importPath: '/src/Foo.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { synthetic: true },
        sourceLocation: { filePath: '/src/Foo.ts', line: 1, column: 1 },
      };

      const plugin: TransformerPlugin = {
        name: 'test-before-codegen',
        beforeCodegen(beans) {
          return [...beans, syntheticBean];
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          export class Foo {}
        `,
        '/src/Bar.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Bar {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      // The synthetic bean should appear in the final beans list
      expect(result.beans.some((b) => b.metadata.synthetic === true)).toBe(
        true,
      );
      // The generated code should reference the synthetic bean's class
      expect(result.code).toContain('token: Foo');
    });
  });

  describe('codegen contributions', () => {
    it('contributes imports to the generated file', () => {
      const plugin: TransformerPlugin = {
        name: 'test-codegen-imports',
        codegen() {
          return {
            imports: ["import { myHelper } from './helper.js'"],
          };
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      expect(result.code).toContain("import { myHelper } from './helper.js'");
    });

    it('contributes code to the generated file', () => {
      const plugin: TransformerPlugin = {
        name: 'test-codegen-code',
        codegen() {
          return {
            code: ['export const pluginOutput = "hello from plugin"'],
          };
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      expect(result.code).toContain('// Plugin contributions');
      expect(result.code).toContain(
        'export const pluginOutput = "hello from plugin"',
      );
    });

    it('contributes both imports and code', () => {
      const plugin: TransformerPlugin = {
        name: 'test-codegen-both',
        codegen() {
          return {
            imports: ["import { validate } from './validate.js'"],
            code: ['export const validated = validate(definitions)'],
          };
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      expect(result.code).toContain("import { validate } from './validate.js'");
      expect(result.code).toContain(
        'export const validated = validate(definitions)',
      );
    });
  });

  describe('multiple plugins', () => {
    it('runs all plugins in order', () => {
      const order: string[] = [];

      const plugin1: TransformerPlugin = {
        name: 'plugin-1',
        beforeScan() {
          order.push('plugin-1:beforeScan');
        },
        visitClass(ctx) {
          order.push(`plugin-1:visitClass:${ctx.className}`);
        },
        afterResolve(beans) {
          order.push('plugin-1:afterResolve');
          return beans;
        },
      };

      const plugin2: TransformerPlugin = {
        name: 'plugin-2',
        beforeScan() {
          order.push('plugin-2:beforeScan');
        },
        visitClass(ctx) {
          order.push(`plugin-2:visitClass:${ctx.className}`);
        },
        afterResolve(beans) {
          order.push('plugin-2:afterResolve');
          return beans;
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [
        plugin1,
        plugin2,
      ]);

      // beforeScan runs in order
      expect(order.indexOf('plugin-1:beforeScan')).toBeLessThan(
        order.indexOf('plugin-2:beforeScan'),
      );

      // Both visit the same class
      expect(order).toContain('plugin-1:visitClass:Foo');
      expect(order).toContain('plugin-2:visitClass:Foo');

      // afterResolve runs in order
      expect(order.indexOf('plugin-1:afterResolve')).toBeLessThan(
        order.indexOf('plugin-2:afterResolve'),
      );
    });

    it('combines codegen contributions from multiple plugins', () => {
      const plugin1: TransformerPlugin = {
        name: 'plugin-1',
        codegen() {
          return {
            imports: ["import { foo } from './foo.js'"],
            code: ['export const fromPlugin1 = foo()'],
          };
        },
      };

      const plugin2: TransformerPlugin = {
        name: 'plugin-2',
        codegen() {
          return {
            imports: ["import { bar } from './bar.js'"],
            code: ['export const fromPlugin2 = bar()'],
          };
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin1, plugin2],
      );
      expect(result.code).toContain("import { foo } from './foo.js'");
      expect(result.code).toContain("import { bar } from './bar.js'");
      expect(result.code).toContain('export const fromPlugin1 = foo()');
      expect(result.code).toContain('export const fromPlugin2 = bar()');
    });

    it('deduplicates identical imports from multiple plugins', () => {
      const plugin1: TransformerPlugin = {
        name: 'plugin-dup-1',
        codegen() {
          return {
            imports: ["import { shared } from './shared.js'"],
          };
        },
      };

      const plugin2: TransformerPlugin = {
        name: 'plugin-dup-2',
        codegen() {
          return {
            imports: ["import { shared } from './shared.js'"],
          };
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin1, plugin2],
      );

      // The import should appear exactly once
      const matches = result.code
        .split('\n')
        .filter(
          (line: string) => line === "import { shared } from './shared.js'",
        );
      expect(matches).toHaveLength(1);
    });
  });

  describe('no-op plugin', () => {
    it('has no effect on transform output', () => {
      const noopPlugin: TransformerPlugin = {
        name: 'noop',
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      // Run without plugin
      const projectBaseline = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });
      const baseline = transformInMemory(
        projectBaseline,
        '/out/AppContext.generated.ts',
      );
      const withPlugin = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [noopPlugin],
      );

      expect(withPlugin.beans).toHaveLength(baseline.beans.length);
      // Warnings count should match
      expect(withPlugin.warnings).toHaveLength(baseline.warnings.length);
    });
  });

  describe('plugin metadata merges into bean metadata', () => {
    it('visitClass metadata appears on the corresponding IR bean', () => {
      const plugin: TransformerPlugin = {
        name: 'test-metadata-merge',
        visitClass(ctx) {
          ctx.metadata.customAnnotation = 'test-value';
        },
      };

      const project = createProject({
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Service {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      const serviceBean = result.beans.find(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      );
      expect(serviceBean).toBeDefined();
      expect(serviceBean!.metadata.customAnnotation).toBe('test-value');
    });

    it('does not collide when two files have same-named classes', () => {
      const plugin: TransformerPlugin = {
        name: 'test-no-collision',
        visitClass(ctx) {
          ctx.metadata.sourceFile = ctx.filePath;
        },
      };

      const project = createProject({
        '/src/a/Service.ts': `
          import { Singleton } from '../decorators.js'
          @Singleton()
          export class Service {}
        `,
        '/src/b/Service.ts': `
          import { Singleton } from '../decorators.js'
          @Singleton()
          export class Service {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );

      const serviceBeans = result.beans.filter(
        (b) =>
          b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
      );
      expect(serviceBeans).toHaveLength(2);

      // Each bean should have metadata pointing to its own source file
      const sourceFiles = serviceBeans.map((b) => b.metadata.sourceFile);
      expect(sourceFiles).toContain('/src/a/Service.ts');
      expect(sourceFiles).toContain('/src/b/Service.ts');
    });

    it('metadata from visitClass is included in generated code', () => {
      const plugin: TransformerPlugin = {
        name: 'test-metadata-in-codegen',
        visitClass(ctx) {
          ctx.metadata.pluginTag = 'generated';
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      expect(result.code).toContain('pluginTag: "generated"');
    });
  });

  describe('beforeScan', () => {
    it('is called before scanning', () => {
      let beforeScanCalled = false;
      const plugin: TransformerPlugin = {
        name: 'test-before-scan',
        beforeScan() {
          beforeScanCalled = true;
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
      });

      transformInMemory(project, '/out/AppContext.generated.ts', [plugin]);
      expect(beforeScanCalled).toBe(true);
    });
  });

  describe('afterResolve — filtering', () => {
    it('can filter out beans', () => {
      const plugin: TransformerPlugin = {
        name: 'test-after-resolve-filter',
        afterResolve(beans) {
          return beans.filter(
            (b) =>
              !(b.tokenRef.kind === 'class' && b.tokenRef.className === 'Foo'),
          );
        },
      };

      const project = createProject({
        '/src/Foo.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Foo {}
        `,
        '/src/Bar.ts': `
          import { Singleton } from './decorators.js'
          @Singleton()
          export class Bar {}
        `,
      });

      const result = transformInMemory(
        project,
        '/out/AppContext.generated.ts',
        [plugin],
      );
      const beanNames = result.beans.map((b) =>
        b.tokenRef.kind === 'class'
          ? b.tokenRef.className
          : b.tokenRef.tokenName,
      );
      expect(beanNames).not.toContain('Foo');
      expect(beanNames).toContain('Bar');
    });
  });
});
