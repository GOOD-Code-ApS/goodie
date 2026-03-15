import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import type { TransformerPlugin } from '../src/options.js';
import { transformInMemory } from '../src/transform.js';
import { MissingProviderError } from '../src/transformer-errors.js';

const decoratorsFile = `
  export function Singleton() { return (t: any, c: any) => {} }
`;

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('Plugin error wrapping', () => {
  it('should wrap afterResolve errors with plugin name', () => {
    const badPlugin: TransformerPlugin = {
      name: 'test-plugin',
      afterResolve() {
        throw new Error('plugin broke');
      },
    };

    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/Foo.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class Foo {}
      `,
    });

    expect(() =>
      transformInMemory(project, '/out/gen.ts', [badPlugin]),
    ).toThrow(/Error in plugin 'test-plugin' during afterResolve/);
  });

  it('should pass through TransformerErrors from plugins without wrapping', () => {
    const badPlugin: TransformerPlugin = {
      name: 'transparent-plugin',
      afterResolve() {
        throw new MissingProviderError('SomeToken', 'SomeComponent', {
          filePath: '/test.ts',
          line: 1,
          column: 1,
        });
      },
    };

    const project = createProject({
      '/src/decorators.ts': decoratorsFile,
      '/src/Foo.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class Foo {}
      `,
    });

    expect(() =>
      transformInMemory(project, '/out/gen.ts', [badPlugin]),
    ).toThrow(/No provider found for "SomeToken"/);
  });
});
