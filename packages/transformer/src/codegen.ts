import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  type CodeBlockWriter,
  IndentationText,
  Project,
  QuoteKind,
  VariableDeclarationKind,
} from 'ts-morph';
import type { IRComponentDefinition, IRPublicMember, TokenRef } from './ir.js';

/** Info about an auto-generated InjectionToken. */
interface TokenInfo {
  tokenName: string;
  typeAnnotation: string | undefined;
}

/** Options for code generation. */
export interface CodegenOptions {
  /** Absolute path of the output file (used for computing relative imports). */
  outputPath: string;
  /** Transformer version string (e.g. '0.1.0'). Embedded in the header comment. */
  version?: string;
  /** Pre-computed IR hash. When provided, skips recomputation inside generateCode(). */
  hash?: string;
  /**
   * Directory containing JSON config files. When set, the generated config
   * factory calls `loadConfigFiles()` to merge file-based configuration.
   * @deprecated Use `inlinedConfig` instead for edge-runtime compatibility.
   */
  configDir?: string;
  /**
   * Pre-loaded and flattened config values from JSON files.
   * When set, config values are embedded directly in the generated code
   * instead of loading them at runtime via `loadConfigFiles()`.
   * This removes the `node:fs` runtime dependency, enabling edge runtimes.
   */
  inlinedConfig?: Record<string, string>;
}

/** Registration data for a non-bean type (e.g., @Introspected DTOs). */
export interface TypeRegistration {
  className: string;
  importPath: string;
  fields: unknown[];
}

/**
 * Compute a SHA-256 hash of all codegen inputs.
 * Used to skip codegen + file write when the DI graph hasn't changed.
 */
export function computeIRHash(
  beans: IRComponentDefinition[],
  options: CodegenOptions,
  typeRegistrations?: TypeRegistration[],
): string {
  const json = JSON.stringify(
    {
      beans,
      options,
      typeRegistrations: typeRegistrations ?? [],
    },
    mapReplacer,
  );
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/** JSON replacer that serializes Map instances as sorted [key, value] arrays. */
function mapReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
  return value;
}

/** Extract the IR hash from a generated file's header line, or undefined if not found. */
export function extractIRHash(fileContent: string): string | undefined {
  const match = fileContent.match(/^\/\/ .+— hash:([a-f0-9]+)/);
  return match?.[1];
}

/** Lazily-initialised ts-morph project for codegen (reused across calls). */
let codegenProject: Project | undefined;

function getCodegenProject(): Project {
  if (!codegenProject) {
    codegenProject = new Project({
      useInMemoryFileSystem: true,
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
        indentationText: IndentationText.TwoSpaces,
      },
    });
  }
  return codegenProject;
}

/** Create a standalone CodeBlockWriter with the project's formatting settings. */
function createWriter(): CodeBlockWriter {
  return getCodegenProject().createWriter();
}

/**
 * Generate the AppContext.generated.ts source from topologically sorted beans.
 */
export function generateCode(
  beans: IRComponentDefinition[],
  options: CodegenOptions,
  typeRegistrations?: TypeRegistration[],
): string {
  const outputDir = path.dirname(options.outputPath);
  const importCache = new Map<string, string>();
  const relativeImport = (absolutePath: string): string => {
    const cached = importCache.get(absolutePath);
    if (cached) return cached;
    const result = computeRelativeImport(outputDir, absolutePath);
    importCache.set(absolutePath, result);
    return result;
  };

  const project = getCodegenProject();
  const existing = project.getSourceFile('__codegen__.ts');
  if (existing) project.removeSourceFile(existing);
  const sf = project.createSourceFile('__codegen__.ts', '');

  // ── Derived flags ──────────────────────────────────────────────────────
  const hasValueFields = beans.some(
    (b) =>
      b.metadata.valueFields &&
      (b.metadata.valueFields as unknown[]).length > 0,
  );
  const hasConfigDir = !!options.configDir || !!options.inlinedConfig;
  const needsConfigBean = hasValueFields || hasConfigDir;

  // AOP / metadata flags (derived from bean metadata)
  const hasValidation = beans.some(
    (b) =>
      b.metadata.validatedMethodParams &&
      (b.metadata.validatedMethodParams as unknown[]).length > 0,
  );
  const hasTypeRegistrations =
    typeRegistrations !== undefined && typeRegistrations.length > 0;
  const needsMetadataRegistry = hasValidation || hasTypeRegistrations;

  // ── Header comment ─────────────────────────────────────────────────────
  const versionTag = options.version ? ` v${options.version}` : '';
  const hash = options.hash ?? computeIRHash(beans, options, typeRegistrations);
  sf.insertText(
    0,
    `// AppContext.generated.ts — DO NOT EDIT (generated by @goodie-ts/transformer${versionTag} — hash:${hash})\n`,
  );

  // ── Core imports ───────────────────────────────────────────────────────
  const coreNamedImports = ['ApplicationContext', 'Goodie'];
  if (options.configDir && !options.inlinedConfig) {
    coreNamedImports.push('loadConfigFiles');
  }

  // Auto-derive AOP utility imports from bean metadata
  const aopImportsNeeded = new Set<string>();
  for (const bean of beans) {
    const methods = bean.metadata.interceptedMethods as
      | InterceptedMethodMeta[]
      | undefined;
    if (!methods || methods.length === 0) continue;
    aopImportsNeeded.add('buildInterceptorChain');
    for (const method of methods) {
      for (const ref of method.interceptors) {
        if (ref.adviceType === 'before')
          aopImportsNeeded.add('wrapBeforeAdvice');
        if (ref.adviceType === 'after') aopImportsNeeded.add('wrapAfterAdvice');
      }
    }
  }
  for (const sym of aopImportsNeeded) {
    coreNamedImports.push(sym);
  }

  if (needsMetadataRegistry) {
    coreNamedImports.push('MetadataRegistry');
  }
  sf.addImportDeclaration({
    moduleSpecifier: '@goodie-ts/core',
    namedImports: coreNamedImports,
  });
  sf.addImportDeclaration({
    moduleSpecifier: '@goodie-ts/core',
    namedImports: ['ComponentDefinition'],
    isTypeOnly: true,
  });

  // ── Collect all imports in a single pass ───────────────────────────────
  const {
    classImports,
    injectionTokens,
    typeOnlyImports,
    interceptorDepsPerBean,
  } = collectAllImports(beans, outputDir, relativeImport);

  classImports.delete('ApplicationContext');

  // Add imports for validated param types
  for (const bean of beans) {
    const params = bean.metadata.validatedMethodParams as
      | ValidatedMethodParam[]
      | undefined;
    if (params) {
      for (const p of params) {
        classImports.set(p.typeClassName, p.typeImportPath);
      }
    }
  }

  // Add imports for introspected type registrations (Phase 3)
  if (typeRegistrations) {
    for (const reg of typeRegistrations) {
      classImports.set(reg.className, reg.importPath);
    }
  }

  const needsInjectionToken = injectionTokens.length > 0 || needsConfigBean;
  if (needsInjectionToken) {
    sf.addImportDeclaration({
      moduleSpecifier: '@goodie-ts/core',
      namedImports: ['InjectionToken'],
    });
  }

  const tokenVarNameMap = buildTokenVarNameMap(injectionTokens);
  const resolveTokenRef = (ref: TokenRef): string => {
    if (ref.kind === 'class') return ref.className;
    return tokenVarNameMap.get(ref.tokenName) ?? tokenVarName(ref.tokenName);
  };

  // ── Class imports (grouped by path) ────────────────────────────────────
  const importsByPath = new Map<string, string[]>();
  for (const [className, importPath] of classImports) {
    const relativePath = relativeImport(importPath);
    const group = importsByPath.get(relativePath) ?? [];
    if (!group.includes(className)) {
      group.push(className);
    }
    importsByPath.set(relativePath, group);
  }
  for (const [relativePath, classNames] of importsByPath) {
    sf.addImportDeclaration({
      moduleSpecifier: relativePath,
      namedImports: classNames.sort(),
    });
  }

  // ── Type-only imports ──────────────────────────────────────────────────
  for (const [typeName, importSpec] of typeOnlyImports) {
    sf.addImportDeclaration({
      moduleSpecifier: importSpec,
      namedImports: [typeName],
      isTypeOnly: true,
    });
  }

  // ── Config token ───────────────────────────────────────────────────────
  if (needsConfigBean) {
    sf.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: '__Goodie_Config',
          initializer: `new InjectionToken<Record<string, unknown>>('__Goodie_Config')`,
        },
      ],
    });
  }

  // ── InjectionToken declarations ────────────────────────────────────────
  for (const token of injectionTokens) {
    const varName = tokenVarNameMap.get(token.tokenName)!;
    const typeParam = token.typeAnnotation ?? 'unknown';
    sf.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: varName,
          initializer: `new InjectionToken<${typeParam}>('${token.tokenName}')`,
        },
      ],
    });
  }

  // ── Scoped proxy factories ─────────────────────────────────────────────
  const scopedProxyBeans = beans.filter(
    (b) =>
      b.scope === 'request' && b.publicMembers && b.publicMembers.length > 0,
  );
  const scopedProxyNames = new Map<IRComponentDefinition, string>();
  for (const bean of scopedProxyBeans) {
    const className =
      bean.tokenRef.kind === 'class'
        ? bean.tokenRef.className
        : bean.tokenRef.tokenName;
    const fnName = `__${className}$scopedProxy`;
    scopedProxyNames.set(bean, fnName);
    sf.addFunction({
      name: fnName,
      parameters: [{ name: 'resolve', type: '() => any' }],
      statements: (writer) => {
        writeScopedProxyBody(writer, className, bean.publicMembers!);
      },
    });
  }

  // ── buildDefinitions ───────────────────────────────────────────────────
  const configParam = needsConfigBean ? 'config' : '_config';
  sf.addFunction({
    isExported: true,
    name: 'buildDefinitions',
    parameters: [
      {
        name: configParam,
        type: 'Record<string, unknown>',
        hasQuestionToken: true,
      },
    ],
    returnType: 'ComponentDefinition[]',
    statements: (writer) => {
      writeComponentDefinitionsBody(
        writer,
        beans,
        needsConfigBean,
        options,
        resolveTokenRef,
        interceptorDepsPerBean,
        scopedProxyNames,
      );
    },
  });

  // ── createContext ──────────────────────────────────────────────────────
  if (needsConfigBean) {
    sf.addFunction({
      isExported: true,
      isAsync: true,
      name: 'createContext',
      parameters: [
        {
          name: 'config',
          type: 'Record<string, unknown>',
          hasQuestionToken: true,
        },
      ],
      returnType: 'Promise<ApplicationContext>',
      statements:
        'return ApplicationContext.create(buildDefinitions(config), { preSorted: true })',
    });
  } else {
    sf.addFunction({
      isExported: true,
      isAsync: true,
      name: 'createContext',
      returnType: 'Promise<ApplicationContext>',
      statements:
        'return ApplicationContext.create(buildDefinitions(), { preSorted: true })',
    });
  }

  // ── app export ─────────────────────────────────────────────────────────
  sf.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'app',
        initializer: 'Goodie.build(buildDefinitions())',
      },
    ],
  });

  // ── Metadata registry (introspection + validation) ──────────────────
  if (hasTypeRegistrations || hasValidation) {
    sf.addStatements((writer) => {
      writer.blankLine();
      writer.writeLine('// Metadata registry population');

      if (hasTypeRegistrations) {
        for (const reg of typeRegistrations!) {
          const fieldsJson = JSON.stringify(reg.fields);
          writer.writeLine(
            `MetadataRegistry.INSTANCE.register({ type: ${reg.className}, className: '${reg.className}', fields: ${fieldsJson} });`,
          );
        }
      }

      if (hasValidation) {
        for (const bean of beans) {
          const params = bean.metadata.validatedMethodParams as
            | ValidatedMethodParam[]
            | undefined;
          if (!params) continue;
          const beanName =
            bean.tokenRef.kind === 'class'
              ? bean.tokenRef.className
              : bean.tokenRef.tokenName;
          for (const p of params) {
            writer.writeLine(
              `MetadataRegistry.INSTANCE.registerMethodParam(${beanName}, '${p.methodName}', ${p.typeClassName}, ${p.paramIndex});`,
            );
          }
        }
      }
    });
  }

  return sf.getFullText();
}

// ── Writer helpers ─────────────────────────────────────────────────────────

/**
 * Write the body of `buildDefinitions()` using CodeBlockWriter.
 * Each bean definition is an object literal in the returned array.
 */
function writeComponentDefinitionsBody(
  writer: CodeBlockWriter,
  beans: IRComponentDefinition[],
  needsConfigBean: boolean,
  options: CodegenOptions,
  resolveTokenRef: (ref: TokenRef) => string,
  interceptorDepsPerBean: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >,
  scopedProxyNames: Map<IRComponentDefinition, string>,
): void {
  writer.write('return [').newLine();
  writer.indent(() => {
    if (needsConfigBean) {
      writeConfigComponentDefinition(writer, options);
    }
    for (const bean of beans) {
      writeComponentDefinition(
        writer,
        bean,
        resolveTokenRef,
        needsConfigBean,
        interceptorDepsPerBean,
        scopedProxyNames,
      );
    }
  });
  writer.write(']');
}

function writeConfigComponentDefinition(
  writer: CodeBlockWriter,
  options: CodegenOptions,
): void {
  writer.writeLine('{');
  writer.indent(() => {
    writer.writeLine('token: __Goodie_Config,');
    writer.writeLine("scope: 'singleton',");
    writer.writeLine('dependencies: [],');
    if (options.inlinedConfig) {
      const configLiteral = JSON.stringify(options.inlinedConfig);
      writer.writeLine(
        `factory: () => ({ ...${configLiteral}, ...process.env, ...config } as Record<string, unknown>),`,
      );
    } else if (options.configDir) {
      const configDirLiteral = JSON.stringify(options.configDir);
      writer.writeLine(
        `factory: () => ({ ...loadConfigFiles(process.env.GOODIE_CONFIG_DIR ?? ${configDirLiteral}, process.env.NODE_ENV), ...process.env, ...config } as Record<string, unknown>),`,
      );
    } else {
      writer.writeLine(
        'factory: () => ({ ...process.env, ...config } as Record<string, unknown>),',
      );
    }
    writer.writeLine('eager: false,');
    writer.writeLine('metadata: {},');
  });
  writer.writeLine('},');
}

function writeComponentDefinition(
  writer: CodeBlockWriter,
  bean: IRComponentDefinition,
  resolveTokenRef: (ref: TokenRef) => string,
  needsConfigBean: boolean,
  interceptorDepsPerBean: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >,
  scopedProxyNames: Map<IRComponentDefinition, string>,
): void {
  writer.writeLine('{');
  writer.indent(() => {
    writer.writeLine(`token: ${resolveTokenRef(bean.tokenRef)},`);
    writer.writeLine(`scope: '${bean.scope}',`);
    writer.writeLine(
      `dependencies: ${depsToCode(bean, resolveTokenRef, needsConfigBean, interceptorDepsPerBean)},`,
    );
    writer.writeLine(
      `factory: ${factoryToCode(bean, interceptorDepsPerBean)},`,
    );
    writer.writeLine(`eager: ${bean.eager},`);
    const proxyFnName = scopedProxyNames.get(bean);
    writer.writeLine(
      `metadata: ${metadataToCode(bean.metadata, proxyFnName)},`,
    );
    if (bean.baseTokenRefs && bean.baseTokenRefs.length > 0) {
      const baseTokensList = bean.baseTokenRefs
        .map((ref) => ref.className)
        .join(', ');
      writer.writeLine(`baseTokens: [${baseTokensList}],`);
    }
  });
  writer.writeLine('},');
}

/**
 * Write the body of a scoped proxy factory using CodeBlockWriter.
 */
function writeScopedProxyBody(
  writer: CodeBlockWriter,
  className: string,
  members: IRPublicMember[],
): void {
  writer.writeLine(`return Object.create(${className}.prototype, {`);
  writer.indent(() => {
    for (const member of members) {
      if (member.kind === 'method') {
        writer.writeLine(
          `${member.name}: { get() { const t = resolve(); return t.${member.name}.bind(t) }, configurable: true },`,
        );
      } else {
        writer.writeLine(
          `${member.name}: { get() { return resolve().${member.name} }, configurable: true },`,
        );
      }
    }
  });
  writer.write('})');
}

// ── Import collection ──────────────────────────────────────────────────────

/** Result of collecting all import-related data in a single pass. */
interface CollectedImports {
  classImports: Map<string, string>;
  injectionTokens: TokenInfo[];
  typeOnlyImports: Map<string, string>;
  interceptorDepsPerBean: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >;
}

/**
 * Collect all import-related data in a single iteration over beans:
 * class imports, injection tokens, type-only imports, and per-bean interceptor deps.
 */
function collectAllImports(
  beans: IRComponentDefinition[],
  outputDir: string,
  relativeImport?: (absolutePath: string) => string,
): CollectedImports {
  const classImports = new Map<string, string>();
  const tokensSeen = new Map<string, TokenInfo>();
  const rawTypeImports: Array<[string, string]> = [];
  const interceptorDepsPerBean = new Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >();

  for (const bean of beans) {
    // Class imports
    addClassImport(classImports, bean.tokenRef);
    for (const dep of bean.constructorDeps) {
      addClassImport(classImports, dep.tokenRef);
    }
    for (const field of bean.fieldDeps) {
      addClassImport(classImports, field.tokenRef);
    }
    if (bean.providesSource) {
      addClassImport(classImports, bean.providesSource.moduleTokenRef);
    }
    if (bean.baseTokenRefs) {
      for (const ref of bean.baseTokenRefs) {
        addClassImport(classImports, ref);
      }
    }

    // Interceptor deps (computed once per bean, cached for reuse)
    const interceptorDeps = collectInterceptorDeps(bean);
    if (interceptorDeps.size > 0) {
      interceptorDepsPerBean.set(bean, interceptorDeps);
      for (const ref of interceptorDeps.values()) {
        if (ref.importPath) {
          classImports.set(ref.className, ref.importPath);
        }
      }
    }

    // Injection tokens
    addToken(tokensSeen, bean.tokenRef);
    for (const dep of bean.constructorDeps) {
      addToken(tokensSeen, dep.tokenRef);
    }
    for (const field of bean.fieldDeps) {
      addToken(tokensSeen, field.tokenRef);
    }

    // Type imports (collected raw, filtered later)
    addRawTypeImports(rawTypeImports, bean.tokenRef);
    for (const dep of bean.constructorDeps) {
      addRawTypeImports(rawTypeImports, dep.tokenRef);
    }
    for (const field of bean.fieldDeps) {
      addRawTypeImports(rawTypeImports, field.tokenRef);
    }
  }

  // Filter type imports against class imports (and deduplicate)
  const typeOnlyImports = new Map<string, string>();
  for (const [typeName, absolutePath] of rawTypeImports) {
    if (classImports.has(typeName)) continue;
    if (typeOnlyImports.has(typeName)) continue;
    typeOnlyImports.set(
      typeName,
      relativeImport
        ? relativeImport(absolutePath)
        : computeRelativeImport(outputDir, absolutePath),
    );
  }

  return {
    classImports,
    injectionTokens: [...tokensSeen.values()],
    typeOnlyImports,
    interceptorDepsPerBean,
  };
}

function addClassImport(imports: Map<string, string>, ref: TokenRef): void {
  if (ref.kind === 'class') {
    imports.set(ref.className, ref.importPath);
  }
}

function addToken(seen: Map<string, TokenInfo>, ref: TokenRef): void {
  if (ref.kind !== 'injection-token') return;
  if (seen.has(ref.tokenName)) return;
  seen.set(ref.tokenName, {
    tokenName: ref.tokenName,
    typeAnnotation: ref.typeAnnotation,
  });
}

function addRawTypeImports(out: Array<[string, string]>, ref: TokenRef): void {
  if (ref.kind !== 'injection-token') return;
  if (!ref.typeImports) return;
  for (const [typeName, absolutePath] of ref.typeImports) {
    out.push([typeName, absolutePath]);
  }
}

// ── Token naming ───────────────────────────────────────────────────────────

/**
 * Build a Map<tokenName, uniqueVarName> with collision detection.
 * When two different tokenNames produce the same varName, append _2, _3, etc.
 */
function buildTokenVarNameMap(tokens: TokenInfo[]): Map<string, string> {
  const result = new Map<string, string>();
  const varNameCounts = new Map<string, number>();

  for (const token of tokens) {
    const baseVarName = tokenVarName(token.tokenName);
    const count = varNameCounts.get(baseVarName) ?? 0;

    if (count === 0) {
      result.set(token.tokenName, baseVarName);
    } else {
      result.set(token.tokenName, `${baseVarName}_${count + 1}`);
    }
    varNameCounts.set(baseVarName, count + 1);
  }

  return result;
}

/**
 * Generate the exported variable name for a token in Pascal_Snake_Case.
 * E.g. 'Repository<User>' → 'Repository_User_Token'
 *      'appName'           → 'App_Name_Token'
 *      'dbUrl'             → 'Db_Url_Token'
 *      'port'              → 'Port_Token'
 */
function tokenVarName(tokenName: string): string {
  const sanitized = tokenName.replace(/[<>, ]/g, '_');
  const segments = sanitized.split('_').filter(Boolean);
  const words = segments.flatMap((seg) =>
    seg
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)),
  );
  return [...words, 'Token'].join('_');
}

// ── Interceptor types & collection ─────────────────────────────────────────

/** Shape of validated method param metadata stored on beans by the validation plugin. */
interface ValidatedMethodParam {
  methodName: string;
  typeClassName: string;
  typeImportPath: string;
  paramIndex: number;
}

/** Metadata shape for intercepted methods (from AOP plugin or other plugins). */
interface InterceptorRefMeta {
  className: string;
  importPath: string;
  adviceType: 'around' | 'before' | 'after';
  order: number;
  metadata?: Record<string, unknown>;
}
interface InterceptedMethodMeta {
  methodName: string;
  interceptors: InterceptorRefMeta[];
}

/** Collect unique interceptor class tokens from bean metadata, in stable order. */
function collectInterceptorDeps(
  bean: IRComponentDefinition,
): Map<string, InterceptorRefMeta> {
  const interceptedMethods = bean.metadata.interceptedMethods as
    | InterceptedMethodMeta[]
    | undefined;
  if (!interceptedMethods || interceptedMethods.length === 0) return new Map();

  const unique = new Map<string, InterceptorRefMeta>();
  for (const method of interceptedMethods) {
    for (const ref of method.interceptors) {
      const key = `${ref.importPath}:${ref.className}`;
      if (!unique.has(key)) {
        unique.set(key, ref);
      }
    }
  }
  return unique;
}

// ── Bean definition code helpers ───────────────────────────────────────────

/** Convert all dependencies of a bean (constructor + field + interceptor) to code. */
function depsToCode(
  bean: IRComponentDefinition,
  resolveTokenRef: (ref: TokenRef) => string,
  needsConfigBean: boolean,
  cachedInterceptorDeps: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >,
): string {
  const allDeps = [
    ...bean.constructorDeps.map((d) => ({
      token: resolveTokenRef(d.tokenRef),
      optional: d.optional,
      collection: d.collection,
    })),
    ...bean.fieldDeps.map((f) => ({
      token: resolveTokenRef(f.tokenRef),
      optional: f.optional,
      collection: false,
    })),
  ];

  const beanValueFields = bean.metadata.valueFields as
    | Array<{ fieldName: string; key: string; default?: string }>
    | undefined;
  if (needsConfigBean && beanValueFields && beanValueFields.length > 0) {
    allDeps.push({
      token: '__Goodie_Config',
      optional: false,
      collection: false,
    });
  }

  const interceptorDeps = cachedInterceptorDeps.get(bean) ?? new Map();
  for (const ref of interceptorDeps.values()) {
    const tokenRef: TokenRef = {
      kind: 'class',
      className: ref.className,
      importPath: ref.importPath,
    };
    allDeps.push({
      token: resolveTokenRef(tokenRef),
      optional: false,
      collection: false,
    });
  }

  if (allDeps.length === 0) return '[]';

  const w = createWriter();
  w.write('[');
  for (let i = 0; i < allDeps.length; i++) {
    const d = allDeps[i];
    w.write(
      `{ token: ${d.token}, optional: ${d.optional}, collection: ${d.collection} }`,
    );
    if (i < allDeps.length - 1) w.write(', ');
  }
  w.write(']');
  return w.toString();
}

/** Generate the factory function code for a bean. */
function factoryToCode(
  bean: IRComponentDefinition,
  cachedInterceptorDeps: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >,
): string {
  if (bean.factoryKind === 'provides') {
    return providesFactoryToCode(bean);
  }

  return constructorFactoryToCode(bean, cachedInterceptorDeps);
}

function constructorFactoryToCode(
  bean: IRComponentDefinition,
  cachedInterceptorDeps: Map<
    IRComponentDefinition,
    Map<string, InterceptorRefMeta>
  >,
): string {
  const className =
    bean.tokenRef.kind === 'class'
      ? bean.tokenRef.className
      : bean.tokenRef.tokenName;

  const beanValueFields = bean.metadata.valueFields as
    | Array<{ fieldName: string; key: string; default?: string }>
    | undefined;
  const hasValues = beanValueFields && beanValueFields.length > 0;

  const interceptedMethods = bean.metadata.interceptedMethods as
    | InterceptedMethodMeta[]
    | undefined;
  const hasInterception =
    interceptedMethods !== undefined && interceptedMethods.length > 0;
  const interceptorDeps = cachedInterceptorDeps.get(bean) ?? new Map();

  const ctorParams = bean.constructorDeps.map((_, i) => `dep${i}`);
  const allParams = [...ctorParams];
  const fieldParams = bean.fieldDeps.map((_, i) => `field${i}`);
  allParams.push(...fieldParams);
  if (hasValues) {
    allParams.push('__config');
  }

  const interceptorParamMap = new Map<string, string>();
  if (hasInterception) {
    let i = 0;
    for (const [key] of interceptorDeps) {
      const paramName = `__interceptor${i}`;
      interceptorParamMap.set(key, paramName);
      allParams.push(paramName);
      i++;
    }
  }

  const needsBody = bean.fieldDeps.length > 0 || hasValues || hasInterception;

  if (allParams.length === 0 && !needsBody) {
    return `() => new ${className}()`;
  }

  const paramList = allParams.map((p) => `${p}: any`).join(', ');
  const ctorArgs = ctorParams.join(', ');

  if (!needsBody) {
    return `(${paramList}) => new ${className}(${ctorArgs})`;
  }

  // Constructor + field injection + value injection + interception via writer
  const w = createWriter();
  w.write(`(${paramList}) => `).inlineBlock(() => {
    w.writeLine(`const instance = new ${className}(${ctorArgs})`);

    for (let i = 0; i < bean.fieldDeps.length; i++) {
      w.writeLine(`instance.${bean.fieldDeps[i].fieldName} = field${i}`);
    }

    if (hasValues) {
      for (const vf of beanValueFields) {
        const safeKey = escapeStringLiteral(vf.key);
        if (vf.default !== undefined) {
          w.writeLine(
            `instance.${vf.fieldName} = __config['${safeKey}'] ?? ${vf.default}`,
          );
        } else {
          w.writeLine(`instance.${vf.fieldName} = __config['${safeKey}']`);
        }
      }
    }

    if (hasInterception) {
      for (const desc of interceptedMethods) {
        const interceptorArgs = desc.interceptors.map((ref) => {
          const key = `${ref.importPath}:${ref.className}`;
          const paramName = interceptorParamMap.get(key)!;
          if (ref.adviceType === 'before') {
            return `wrapBeforeAdvice(${paramName})`;
          }
          if (ref.adviceType === 'after') {
            return `wrapAfterAdvice(${paramName})`;
          }
          return paramName;
        });

        const hasMetadata = desc.interceptors.some((ref) => ref.metadata);
        let metadataArg = '';
        if (hasMetadata) {
          const metadataItems = desc.interceptors.map((ref) =>
            ref.metadata ? JSON.stringify(ref.metadata) : 'undefined',
          );
          metadataArg = `, [${metadataItems.join(', ')}]`;
        }

        const safeMethodName = escapeStringLiteral(desc.methodName);
        w.writeLine(
          `instance.${desc.methodName} = buildInterceptorChain([${interceptorArgs.join(', ')}], instance, '${escapeStringLiteral(className)}', '${safeMethodName}', instance.${desc.methodName}.bind(instance)${metadataArg})`,
        );
      }
    }

    w.write('return instance');
  });

  return w.toString();
}

function providesFactoryToCode(bean: IRComponentDefinition): string {
  const w = createWriter();

  if (!bean.providesSource) {
    const tokenName =
      bean.tokenRef.kind === 'class'
        ? bean.tokenRef.className
        : bean.tokenRef.tokenName;
    w.write(`() => `).inlineBlock(() => {
      w.write(
        `throw new Error("Bean '${tokenName}' is a @Provides bean but has no source module. This is a transformer bug.")`,
      );
    });
    return w.toString();
  }

  const { moduleTokenRef, methodName } = bean.providesSource;

  const params = bean.constructorDeps.map((_, i) => `dep${i}: any`);
  const args = bean.constructorDeps.slice(1).map((_, i) => `dep${i + 1}`);

  const paramList = params.join(', ');
  const argList = args.join(', ');

  w.write(
    `(${paramList}) => (dep0 as ${moduleTokenRef.className}).${methodName}(${argList})`,
  );
  return w.toString();
}

function metadataToCode(
  metadata: Record<string, unknown>,
  scopedProxyFnName?: string,
): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0 && !scopedProxyFnName) return '{}';

  const w = createWriter();
  w.write('{ ');
  const items: string[] = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  if (scopedProxyFnName) {
    items.push(`scopedProxyFactory: ${scopedProxyFnName}`);
  }
  w.write(items.join(', '));
  w.write(' }');
  return w.toString();
}

// ── Path utilities ─────────────────────────────────────────────────────────

/** Compute a relative import path from the output dir to the target file, with .js extension. */
function computeRelativeImport(
  outputDir: string,
  absolutePath: string,
): string {
  if (absolutePath.includes('node_modules')) {
    return extractPackageName(absolutePath);
  }

  if (!path.isAbsolute(absolutePath)) {
    return absolutePath;
  }

  let relative = path.relative(outputDir, absolutePath);
  relative = relative.replace(/\.tsx?$/, '.js');

  if (!relative.startsWith('.')) {
    relative = `./${relative}`;
  }

  return relative;
}

/**
 * Extract a bare package name from a node_modules path.
 * E.g. '/project/node_modules/pg/lib/index.d.ts' → 'pg'
 *      '/project/node_modules/@types/pg/index.d.ts' → 'pg'
 *      '/project/node_modules/@scope/pkg/lib/index.d.ts' → '@scope/pkg'
 */
function extractPackageName(absolutePath: string): string {
  const segments = absolutePath.split('/node_modules/');
  const afterNodeModules = segments[segments.length - 1];
  const parts = afterNodeModules.split('/');

  let packageName: string;
  if (parts[0].startsWith('@')) {
    packageName = `${parts[0]}/${parts[1]}`;
  } else {
    packageName = parts[0];
  }

  if (packageName.startsWith('@types/')) {
    packageName = packageName.slice('@types/'.length);
  }

  return packageName;
}

/**
 * Escape characters that could break out of a single-quoted string literal.
 * Prevents code injection via @Value keys.
 */
function escapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
