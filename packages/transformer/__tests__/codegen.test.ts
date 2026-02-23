import type { IRBeanDefinition } from '@goodie/transformer';
import { describe, expect, it } from 'vitest';
import { generateCode } from '../src/codegen.js';

const loc = { filePath: '/src/test.ts', line: 1, column: 1 };

describe('Code Generator', () => {
  it('should generate code for a bean with no dependencies', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Repo',
          importPath: '/src/Repo.ts',
        },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain("import { Repo } from '../src/Repo.js'");
    expect(code).toContain('token: Repo');
    expect(code).toContain("scope: 'prototype'");
    expect(code).toContain('dependencies: []');
    expect(code).toContain('() => new Repo()');
    expect(code).toContain('eager: false');
  });

  it('should generate code for a singleton bean with constructor deps', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Repo',
          importPath: '/src/Repo.ts',
        },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'Service',
          importPath: '/src/Service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'Repo',
              importPath: '/src/Repo.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain("scope: 'singleton'");
    expect(code).toContain('{ token: Repo, optional: false }');
    expect(code).toContain('(dep0: any) => new Service(dep0)');
  });

  it('should generate InjectionToken declarations for method-name tokens', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'AppModule',
          importPath: '/src/AppModule.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { isModule: true },
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'dbUrl',
          importPath: undefined,
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'AppModule',
              importPath: '/src/AppModule.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [],
        factoryKind: 'provides',
        providesSource: {
          moduleTokenRef: {
            kind: 'class',
            className: 'AppModule',
            importPath: '/src/AppModule.ts',
          },
          methodName: 'dbUrl',
        },
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain("import { InjectionToken } from '@goodie/core'");
    expect(code).toContain(
      "export const Db_Url_Token = new InjectionToken<unknown>('dbUrl')",
    );
    expect(code).toContain('token: Db_Url_Token');
  });

  it('should generate @Provides factory code', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'AppModule',
          importPath: '/src/AppModule.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { isModule: true },
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'dbUrl',
          importPath: undefined,
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'AppModule',
              importPath: '/src/AppModule.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [],
        factoryKind: 'provides',
        providesSource: {
          moduleTokenRef: {
            kind: 'class',
            className: 'AppModule',
            importPath: '/src/AppModule.ts',
          },
          methodName: 'dbUrl',
        },
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain('(dep0: any) => (dep0 as AppModule).dbUrl()');
  });

  it('should generate @Provides factory with method params', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'AppModule',
          importPath: '/src/AppModule.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { isModule: true },
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'Config',
          importPath: '/src/Config.ts',
        },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'dbUrl',
          importPath: undefined,
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'AppModule',
              importPath: '/src/AppModule.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
          {
            tokenRef: {
              kind: 'class',
              className: 'Config',
              importPath: '/src/Config.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [],
        factoryKind: 'provides',
        providesSource: {
          moduleTokenRef: {
            kind: 'class',
            className: 'AppModule',
            importPath: '/src/AppModule.ts',
          },
          methodName: 'dbUrl',
        },
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain(
      '(dep0: any, dep1: any) => (dep0 as AppModule).dbUrl(dep1)',
    );
  });

  it('should generate field injection factory', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Repo',
          importPath: '/src/Repo.ts',
        },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'Service',
          importPath: '/src/Service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [
          {
            fieldName: 'repo',
            tokenRef: {
              kind: 'class',
              className: 'Repo',
              importPath: '/src/Repo.ts',
            },
            optional: false,
          },
        ],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain('{ token: Repo, optional: false }');
    expect(code).toContain('const instance = new Service()');
    expect(code).toContain('instance.repo = field0');
    expect(code).toContain('return instance');
  });

  it('should generate mixed constructor + field injection', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: { kind: 'class', className: 'A', importPath: '/src/A.ts' },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: { kind: 'class', className: 'B', importPath: '/src/B.ts' },
        scope: 'prototype',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'Service',
          importPath: '/src/Service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'A',
              importPath: '/src/A.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [
          {
            fieldName: 'b',
            tokenRef: {
              kind: 'class',
              className: 'B',
              importPath: '/src/B.ts',
            },
            optional: false,
          },
        ],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain('(dep0: any, field0: any)');
    expect(code).toContain('const instance = new Service(dep0)');
    expect(code).toContain('instance.b = field0');
  });

  it('should generate createContext function', () => {
    const code = generateCode([], {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain(
      'export async function createContext(): Promise<ApplicationContext>',
    );
    expect(code).toContain('return ApplicationContext.create(definitions)');
    expect(code).toContain('export { definitions }');
  });

  it('should generate Goodie app builder export', () => {
    const code = generateCode([], {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain(
      "import { ApplicationContext, Goodie } from '@goodie/core'",
    );
    expect(code).toContain('export const app = Goodie.build(definitions)');
  });

  it('should generate eager: true for eager beans', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Startup',
          importPath: '/src/Startup.ts',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain('eager: true');
  });

  it('should generate sanitized variable names for generic InjectionTokens', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'Repository<User>',
          importPath: '/src/Repository.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    // Variable name should be sanitized and exported
    expect(code).toContain(
      "export const Repository_User_Token = new InjectionToken<unknown>('Repository<User>')",
    );
    // Token reference should use sanitized name
    expect(code).toContain('token: Repository_User_Token');
  });

  it('should generate distinct tokens for different specializations', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'Repository<User>',
          importPath: '/src/Repository.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'Repository<Order>',
          importPath: '/src/Repository.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain(
      "export const Repository_User_Token = new InjectionToken<unknown>('Repository<User>')",
    );
    expect(code).toContain(
      "export const Repository_Order_Token = new InjectionToken<unknown>('Repository<Order>')",
    );
  });

  it('should generate InjectionTokens for generic deps with importPath', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Service',
          importPath: '/src/Service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'injection-token',
              tokenName: 'Repository<User>',
              importPath: '/src/Repository.ts',
            },
            optional: false,
            sourceLocation: loc,
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    // Should generate an InjectionToken even though it has an importPath
    expect(code).toContain(
      "export const Repository_User_Token = new InjectionToken<unknown>('Repository<User>')",
    );
    expect(code).toContain('{ token: Repository_User_Token, optional: false }');
  });

  it('should generate distinct var names when tokenNames collide after sanitization', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'Repository<User>',
          importPath: '/src/Repository.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'injection-token',
          tokenName: 'RepositoryUser',
          importPath: '/src/RepositoryUser.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    // First gets the base name, second gets a _2 suffix
    expect(code).toContain(
      "export const Repository_User_Token = new InjectionToken<unknown>('Repository<User>')",
    );
    expect(code).toContain(
      "export const Repository_User_Token_2 = new InjectionToken<unknown>('RepositoryUser')",
    );
    // Both should appear as token references in their bean definitions
    expect(code).toContain('token: Repository_User_Token,');
    expect(code).toContain('token: Repository_User_Token_2,');
  });

  it('should generate metadata for module beans', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'AppModule',
          importPath: '/src/AppModule.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: { isModule: true },
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).toContain('metadata: { isModule: true }');
  });
});
