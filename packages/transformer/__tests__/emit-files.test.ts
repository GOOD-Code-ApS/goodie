import { VariableDeclarationKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import type { TransformerPlugin } from '../src/options.js';
import { createTestProject } from './helpers.js';

describe('emitFiles plugin hook', () => {
  const SERVICE_FILE = `
    import { Singleton } from './decorators.js';

    @Singleton()
    class GreetService {
      greet() { return 'hello'; }
    }
  `;

  it('collects emitted files from plugins via createSourceFile', () => {
    const plugin: TransformerPlugin = {
      name: 'test-emit',
      emitFiles(ctx) {
        const sf = ctx.createSourceFile('routes.ts');
        sf.addStatements('// Generated routes');
        sf.addStatements('export const routes = [];');
      },
    };

    const result = createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(result.emittedFiles).toHaveLength(1);
    expect(result.emittedFiles![0].relativePath).toBe('routes.ts');
    expect(result.emittedFiles![0].content).toContain(
      'export const routes = [];',
    );
  });

  it('provides components to the emitFiles context', () => {
    let receivedComponentNames: string[] = [];

    const plugin: TransformerPlugin = {
      name: 'test-emit-components',
      emitFiles(ctx) {
        receivedComponentNames = ctx.components
          .filter((c) => c.tokenRef.kind === 'class')
          .map((c) => c.tokenRef.className);
      },
    };

    createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(receivedComponentNames).toContain('GreetService');
  });

  it('supports ts-morph API for type-safe code generation', () => {
    const plugin: TransformerPlugin = {
      name: 'test-emit-tsmorph',
      emitFiles(ctx) {
        const sf = ctx.createSourceFile('schemas.ts');
        sf.addImportDeclaration({
          moduleSpecifier: 'valibot',
          namedImports: ['object', 'string'],
        });
        sf.addVariableStatement({
          isExported: true,
          declarationKind: VariableDeclarationKind.Const,
          declarations: [
            {
              name: 'UserSchema',
              initializer: 'object({ name: string() })',
            },
          ],
        });
      },
    };

    const result = createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(result.emittedFiles).toHaveLength(1);
    const content = result.emittedFiles![0].content;
    expect(content).toContain('import { object, string } from "valibot"');
    expect(content).toContain(
      'export const UserSchema = object({ name: string() })',
    );
  });

  it('supports multiple plugins emitting files', () => {
    const plugin1: TransformerPlugin = {
      name: 'emit-routes',
      emitFiles(ctx) {
        const sf = ctx.createSourceFile('routes.ts');
        sf.addStatements('export const routes = [];');
      },
    };
    const plugin2: TransformerPlugin = {
      name: 'emit-schemas',
      emitFiles(ctx) {
        const sf = ctx.createSourceFile('schemas.ts');
        sf.addStatements('export const schemas = {};');
      },
    };

    const result = createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin1, plugin2],
    );

    expect(result.emittedFiles).toHaveLength(2);
    const paths = result.emittedFiles!.map((f) => f.relativePath);
    expect(paths).toContain('routes.ts');
    expect(paths).toContain('schemas.ts');
  });

  it('returns undefined emittedFiles when no plugin uses emitFiles', () => {
    const result = createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
    );

    expect(result.emittedFiles).toBeUndefined();
  });

  it('computes relativeImport from __generated__/ to source files', () => {
    let computedImport = '';

    const plugin: TransformerPlugin = {
      name: 'test-relative',
      emitFiles(ctx) {
        computedImport = ctx.relativeImport('/out/src/service.ts');
      },
    };

    createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(computedImport).toBe('../src/service.js');
  });

  it('passes bare specifiers through relativeImport unchanged', () => {
    let computedImport = '';

    const plugin: TransformerPlugin = {
      name: 'test-bare-specifier',
      emitFiles(ctx) {
        computedImport = ctx.relativeImport('@goodie-ts/health');
      },
    };

    createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(computedImport).toBe('@goodie-ts/health');
  });

  it('adds side-effect imports for emitted files in generated code', () => {
    const plugin: TransformerPlugin = {
      name: 'test-side-effect',
      emitFiles(ctx) {
        const sf = ctx.createSourceFile('routes.ts');
        sf.addStatements('export const routes = [];');
      },
    };

    const result = createTestProject(
      { '/src/service.ts': SERVICE_FILE },
      '/out/__generated__/context.ts',
      [plugin],
    );

    expect(result.code).toContain("import './routes.js'");
  });
});
