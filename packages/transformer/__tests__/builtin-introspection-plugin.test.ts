import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { transformInMemory } from '../src/transform.js';
import { createTestProject, DECORATOR_STUBS } from './helpers.js';

/** Create a test project with strictNullChecks enabled (required for @Introspected). */
function createStrictTestProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strictNullChecks: true },
  });

  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, '/out/AppContext.generated.ts');
}

describe('builtin-introspection-plugin', () => {
  it('generates MetadataRegistry for @Introspected class with primitive fields', () => {
    const result = createStrictTestProject({
      '/src/CreateTodoRequest.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class CreateTodoRequest {
          title!: string
          count!: number
          done!: boolean
        }
      `,
    });

    expect(result.code).toContain('MetadataRegistry');
    expect(result.code).toContain('MetadataRegistry.INSTANCE');
    expect(result.code).toContain('CreateTodoRequest');
    expect(result.code).toContain('"kind":"primitive","type":"string"');
    expect(result.code).toContain('"kind":"primitive","type":"number"');
    expect(result.code).toContain('"kind":"primitive","type":"boolean"');
  });

  it('does not generate introspection code when no @Introspected classes exist', () => {
    const result = createTestProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators'

        @Singleton()
        class MyService {}
      `,
    });

    expect(result.code).not.toContain('MetadataRegistry');
    expect(result.code).not.toContain('MetadataRegistry.INSTANCE');
  });

  it('handles optional fields (T | undefined)', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          description?: string
        }
      `,
    });

    expect(result.code).toContain('"kind":"optional"');
    expect(result.code).toContain('"kind":"primitive","type":"string"');
  });

  it('handles nullable fields (T | null)', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          value!: string | null
        }
      `,
    });

    expect(result.code).toContain('"kind":"nullable"');
    expect(result.code).toContain('"kind":"primitive","type":"string"');
  });

  it('handles optional AND nullable fields (string | null | undefined)', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          value?: string | null
        }
      `,
    });

    // undefined stripped first → optional, then null stripped → nullable, then primitive
    expect(result.code).toContain(
      '"kind":"optional","inner":{"kind":"nullable","inner":{"kind":"primitive","type":"string"}}',
    );
  });

  it('handles array fields', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          tags!: string[]
        }
      `,
    });

    expect(result.code).toContain('"kind":"array"');
    expect(result.code).toContain('"elementType"');
    expect(result.code).toContain('"kind":"primitive","type":"string"');
  });

  it('handles literal union types', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          status!: 'active' | 'inactive'
        }
      `,
    });

    expect(result.code).toContain('"kind":"union"');
    expect(result.code).toContain('"kind":"literal"');
  });

  it('handles reference types to other @Introspected classes', () => {
    const result = createStrictTestProject({
      '/src/Address.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        export class Address {
          street!: string
          city!: string
        }
      `,
      '/src/Person.ts': `
        import { Introspected } from './decorators'
        import { Address } from './Address'

        @Introspected()
        class Person {
          name!: string
          address!: Address
        }
      `,
    });

    expect(result.code).toContain('"kind":"reference","className":"Address"');
    expect(result.code).toMatch(
      /MetadataRegistry\.INSTANCE\.register\(.*Address.*\)/,
    );
    expect(result.code).toMatch(
      /MetadataRegistry\.INSTANCE\.register\(.*Person.*\)/,
    );
  });

  it('skips private and protected fields', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          name!: string
          private secret!: string
          protected internal!: number
        }
      `,
    });

    expect(result.code).toContain('"name":"name"');
    expect(result.code).not.toContain('"name":"secret"');
    expect(result.code).not.toContain('"name":"internal"');
  });

  it('does not register @Introspected class as a component', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          name!: string
        }
      `,
    });

    expect(result.components).toHaveLength(0);
    expect(result.code).toContain('MetadataRegistry.INSTANCE');
  });

  it('records field decorators generically', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected, MinLength, Email } from './decorators'

        @Introspected()
        class Dto {
          @MinLength(3)
          name!: string

          @Email()
          email!: string
        }
      `,
    });

    expect(result.code).toContain('"name":"MinLength"');
    expect(result.code).toContain('"name":"Email"');
    expect(result.code).toContain('"value":3');
  });

  it('emits empty decorators array for fields without decorators', () => {
    const result = createStrictTestProject({
      '/src/Dto.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        class Dto {
          name!: string
        }
      `,
    });

    expect(result.code).toContain('"decorators":[]');
  });

  it('works alongside component definitions', () => {
    const result = createStrictTestProject({
      '/src/CreateTodoRequest.ts': `
        import { Introspected } from './decorators'

        @Introspected()
        export class CreateTodoRequest {
          title!: string
        }
      `,
      '/src/TodoService.ts': `
        import { Singleton } from './decorators'

        @Singleton()
        class TodoService {
          create() { return 'created' }
        }
      `,
    });

    expect(result.components).toHaveLength(1);
    expect(result.components[0].tokenRef).toMatchObject({
      kind: 'class',
      className: 'TodoService',
    });

    expect(result.code).toContain('MetadataRegistry.INSTANCE');
    expect(result.code).toContain('CreateTodoRequest');
  });
});
