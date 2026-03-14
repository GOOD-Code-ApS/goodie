import type { Scope } from '@goodie-ts/core';
import {
  type ClassDeclaration,
  type Decorator,
  type Project,
  type SourceFile,
  SyntaxKind,
  type Type,
} from 'ts-morph';
import type { ClassTokenRef, IRDecoratorEntry, SourceLocation } from './ir.js';
import type {
  ClassVisitorContext,
  MethodVisitorContext,
  TransformerPlugin,
} from './options.js';
import { InvalidDecoratorUsageError } from './transformer-errors.js';

/** Cached result of resolving a type's symbol and source file. */
interface ResolvedTypeInfo {
  symbolName: string | undefined;
  sourceFile: SourceFile | undefined;
}

/** Cache for type resolution results, scoped to a single scan() call. */
interface TypeResolutionCache {
  /** Cache for getType() → getSymbol() → getDeclarations() chain, keyed by filePath:startPos. */
  symbols: Map<string, ResolvedTypeInfo>;
  /** Cache for extractTypeArguments() results, keyed by type text. */
  typeArgs: Map<string, ScannedTypeArgument[]>;
}

/** Names of decorators we recognize from @goodie-ts/core. */
const DECORATOR_NAMES = {
  Transient: 'Transient',
  Singleton: 'Singleton',
  Named: 'Named',
  Eager: 'Eager',
  Factory: 'Factory',
  Provides: 'Provides',
  Inject: 'Inject',
  Optional: 'Optional',
  OnDestroy: 'OnDestroy',
  OnInit: 'OnInit',
  PostProcessor: 'PostProcessor',
  RequestScoped: 'RequestScoped',
  Value: 'Value',
} as const;

/** A public member of a @RequestScoped bean, used for compile-time scoped proxy generation. */
export interface ScannedPublicMember {
  name: string;
  kind: 'getter' | 'method' | 'property';
}

/** A class decorated with @Transient, @Singleton, or @Factory. */
export interface ScannedBean {
  classDeclaration: ClassDeclaration;
  classTokenRef: ClassTokenRef;
  scope: Scope;
  eager: boolean;
  name: string | undefined;
  constructorParams: ScannedConstructorParam[];
  fieldInjections: ScannedFieldInjection[];
  /** Method names decorated with @OnDestroy(). */
  onDestroyMethods: string[];
  /** Method names decorated with @OnInit(). */
  onInitMethods: string[];
  /** Whether @PostProcessor() is present on this class. */
  isComponentPostProcessor: boolean;
  /** Fields decorated with @Value('key'). */
  valueFields: ScannedValueField[];
  /** Base classes this bean extends (for baseTokens registration). */
  baseClasses: ClassTokenRef[];
  /** Whether this bean was decorated with @Factory(). */
  isFactory: boolean;
  /** @Provides methods defined on this class (any bean, not just @Factory). */
  provides: ScannedProvides[];
  /** All decorators found on this class with resolved import paths. */
  decorators: IRDecoratorEntry[];
  /** Decorators found on methods, keyed by method name. */
  methodDecorators: Record<string, IRDecoratorEntry[]>;
  /** Public members for compile-time scoped proxy generation (only for request-scoped beans). */
  publicMembers?: ScannedPublicMember[];
  sourceLocation: SourceLocation;
}

/** A resolved type argument for generic types (recursive for nested generics). */
export interface ScannedTypeArgument {
  typeName: string;
  typeSourceFile: SourceFile | undefined;
  typeArguments: ScannedTypeArgument[];
}

/** A constructor parameter discovered via AST analysis. */
export interface ScannedConstructorParam {
  paramName: string;
  typeName: string | undefined;
  typeSourceFile: SourceFile | undefined;
  /** Type arguments if this is a generic type (e.g. Repository<User>). */
  typeArguments: ScannedTypeArgument[];
  /** The resolved base type name (e.g. 'Repository' for Repository<User>). */
  resolvedBaseTypeName: string | undefined;
  /** True when the parameter is typed as T[] or Array<T>. */
  isCollection: boolean;
  /** When isCollection is true, the element type info for the array. */
  elementTypeName: string | undefined;
  elementTypeSourceFile: SourceFile | undefined;
  elementTypeArguments: ScannedTypeArgument[];
  elementResolvedBaseTypeName: string | undefined;
  sourceLocation: SourceLocation;
}

/** A @Value('key') field discovered on an accessor. */
export interface ScannedValueField {
  fieldName: string;
  /** The config key string from @Value('key'). */
  key: string;
  /** Default value if provided via @Value('key', { default: ... }). */
  defaultValue: string | undefined;
}

/** A field injection discovered from @Inject / @Optional on an accessor. */
export interface ScannedFieldInjection {
  fieldName: string;
  /** The qualifier argument from @Inject(qualifier). */
  qualifier: string | undefined;
  /** Whether @Optional() is present on this field. */
  optional: boolean;
  /** The type annotation of the accessor field. */
  typeName: string | undefined;
  typeSourceFile: SourceFile | undefined;
  /** Type arguments if this is a generic type. */
  typeArguments: ScannedTypeArgument[];
  /** The resolved base type name (e.g. 'Repository' for Repository<User>). */
  resolvedBaseTypeName: string | undefined;
  sourceLocation: SourceLocation;
}

/** A @Provides method inside a bean class. */
export interface ScannedProvides {
  methodName: string;
  returnTypeName: string | undefined;
  returnTypeSourceFile: SourceFile | undefined;
  /** Type arguments of the return type if generic. */
  returnTypeArguments: ScannedTypeArgument[];
  /** The resolved base type name of the return type. */
  returnResolvedBaseTypeName: string | undefined;
  params: ScannedConstructorParam[];
  /** Whether @Eager() is present on this @Provides method. */
  eager: boolean;
  sourceLocation: SourceLocation;
}

/** Result of scanning source files. */
export interface ScanResult {
  beans: ScannedBean[];
  warnings: string[];
  /** Plugin-accumulated class metadata, keyed by "filePath:className". Only populated when plugins with visitor hooks are provided. */
  pluginMetadata?: Map<string, Record<string, unknown>>;
}

/** Scan a ts-morph Project for decorated classes. */
export function scan(
  project: Project,
  plugins?: TransformerPlugin[],
): ScanResult {
  const beans: ScannedBean[] = [];
  const warnings: string[] = [];
  const pluginMetadata = new Map<string, Record<string, unknown>>();
  const hasVisitors =
    plugins?.some((p) => p.visitClass || p.visitMethod) ?? false;
  const typeCache: TypeResolutionCache = {
    symbols: new Map(),
    typeArgs: new Map(),
  };

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.endsWith('.d.ts') || filePath.includes('/node_modules/'))
      continue;

    for (const cls of sourceFile.getClasses()) {
      const decorators = cls.getDecorators();
      if (decorators.length === 0) continue;

      // Track plugin-driven bean registration
      let pluginBeanScope: Scope | undefined;
      let pluginDecoratorName: string | undefined;

      // Run plugin visitor hooks for any decorated class with a name
      if (hasVisitors) {
        const className = cls.getName();
        if (className) {
          const metadata: Record<string, unknown> = {};
          const metadataKey = `${filePath}:${className}`;
          pluginMetadata.set(metadataKey, metadata);
          const classDecorators = resolveDecoratorImports(decorators);

          const classCtx: ClassVisitorContext = {
            classDeclaration: cls,
            className,
            filePath,
            decorators: classDecorators,
            metadata,
            registerBean(options: { scope: Scope; decoratorName?: string }) {
              if (pluginBeanScope !== undefined) {
                throw new InvalidDecoratorUsageError(
                  options.decoratorName ?? 'bean',
                  `Class "${className}" was already registered as a bean by a plugin (via @${pluginDecoratorName ?? 'unknown'}). Only one plugin may register a class as a bean.`,
                  getSourceLocation(cls, sourceFile),
                );
              }
              pluginBeanScope = options.scope;
              pluginDecoratorName = options.decoratorName;
            },
          };
          for (const plugin of plugins!) {
            plugin.visitClass?.(classCtx);
          }

          for (const method of cls.getMethods()) {
            const methodDecs = resolveDecoratorImports(method.getDecorators());
            const methodCtx: MethodVisitorContext = {
              methodDeclaration: method,
              methodName: method.getName(),
              className,
              filePath,
              classMetadata: metadata,
              classDecorators,
              decorators: methodDecs,
            };
            for (const plugin of plugins!) {
              plugin.visitMethod?.(methodCtx);
            }
          }
        }
      }

      const isFactory = hasDecorator(decorators, DECORATOR_NAMES.Factory);
      const isTransient = hasDecorator(decorators, DECORATOR_NAMES.Transient);
      const isSingleton = hasDecorator(decorators, DECORATOR_NAMES.Singleton);
      const isRequestScoped = hasDecorator(
        decorators,
        DECORATOR_NAMES.RequestScoped,
      );
      const isPostProcessor = hasDecorator(
        decorators,
        DECORATOR_NAMES.PostProcessor,
      );
      const isPluginBean = pluginBeanScope !== undefined;
      const coreDecoratorBean =
        isFactory ||
        isTransient ||
        isSingleton ||
        isRequestScoped ||
        isPostProcessor;

      // Plugin-registered beans cannot be combined with core DI decorators
      if (isPluginBean && coreDecoratorBean) {
        const coreDecName = isFactory
          ? 'Factory'
          : isSingleton
            ? 'Singleton'
            : isRequestScoped
              ? 'RequestScoped'
              : isPostProcessor
                ? 'PostProcessor'
                : 'Transient';
        throw new InvalidDecoratorUsageError(
          pluginDecoratorName ?? 'bean',
          `@${pluginDecoratorName ?? 'PluginBean'} cannot be combined with @${coreDecName} on class "${cls.getName()}". @${pluginDecoratorName ?? 'PluginBean'} already registers the class as a bean.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      const isBean = coreDecoratorBean || isPluginBean;
      if (!isBean) continue;

      if (cls.isAbstract()) {
        const decoratorName = isFactory
          ? 'Factory'
          : isSingleton
            ? 'Singleton'
            : isRequestScoped
              ? 'RequestScoped'
              : isPostProcessor
                ? 'PostProcessor'
                : isTransient
                  ? 'Transient'
                  : (pluginDecoratorName ?? 'bean');
        throw new InvalidDecoratorUsageError(
          decoratorName,
          `Cannot apply @${decoratorName}() to abstract class "${cls.getName()}". Abstract classes cannot be instantiated. Remove the decorator or make the class concrete.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isPostProcessor && isTransient) {
        throw new InvalidDecoratorUsageError(
          'PostProcessor',
          `@PostProcessor cannot be combined with @Transient — post-processors must be singletons. Use @PostProcessor() @Singleton() instead.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      const scope: Scope = isRequestScoped
        ? 'request'
        : isFactory ||
            isSingleton ||
            isPostProcessor ||
            pluginBeanScope === 'singleton'
          ? 'singleton'
          : (pluginBeanScope ?? 'transient');
      const scannedBean = scanBean(
        cls,
        decorators,
        sourceFile,
        scope,
        isFactory,
        typeCache,
      );
      if (scannedBean) beans.push(scannedBean);
    }
  }

  return {
    beans,
    warnings,
    ...(hasVisitors ? { pluginMetadata } : {}),
  };
}

function scanBean(
  cls: ClassDeclaration,
  decorators: Decorator[],
  sourceFile: SourceFile,
  scope: Scope,
  isFactory: boolean,
  cache: TypeResolutionCache,
): ScannedBean | undefined {
  const className = cls.getName();
  if (!className) return undefined;
  const eager = hasDecorator(decorators, DECORATOR_NAMES.Eager);
  const name = getNamedValue(decorators);
  const constructorParams = scanConstructorParams(cls, cache);
  const fieldInjections = scanFieldInjections(cls, cache);
  const lifecycle = scanLifecycleMethods(cls);
  const isComponentPostProcessor = hasDecorator(
    decorators,
    DECORATOR_NAMES.PostProcessor,
  );
  const valueFields = scanValueFields(cls);
  const baseClasses = extractBaseClasses(cls);
  const provides = scanProvidesMethods(cls, sourceFile, cache);
  const scannedDecorators = resolveDecoratorImports(decorators);
  const methodDecorators: Record<string, IRDecoratorEntry[]> = {};
  for (const method of cls.getMethods()) {
    const methodDecs = resolveDecoratorImports(method.getDecorators());
    if (methodDecs.length > 0) {
      methodDecorators[method.getName()] = methodDecs;
    }
  }

  // Extract public members for request-scoped beans (used for compile-time scoped proxy)
  const publicMembers =
    scope === 'request' ? extractPublicMembers(cls, lifecycle) : undefined;

  return {
    classDeclaration: cls,
    classTokenRef: {
      kind: 'class',
      className,
      importPath: sourceFile.getFilePath(),
    },
    scope,
    eager,
    name,
    constructorParams,
    fieldInjections,
    onDestroyMethods: lifecycle.preDestroy,
    onInitMethods: lifecycle.postConstruct,
    isComponentPostProcessor,
    valueFields,
    baseClasses,
    isFactory,
    provides,
    decorators: scannedDecorators,
    methodDecorators:
      Object.keys(methodDecorators).length > 0 ? methodDecorators : {},
    publicMembers,
    sourceLocation: getSourceLocation(cls, sourceFile),
  };
}

function scanConstructorParams(
  cls: ClassDeclaration,
  cache: TypeResolutionCache,
): ScannedConstructorParam[] {
  const ctor = cls.getConstructors()[0];
  if (!ctor) return [];

  return ctor.getParameters().map((param) => {
    const typeNode = param.getTypeNode();
    let typeName: string | undefined;
    let typeSourceFile: SourceFile | undefined;
    let typeArguments: ScannedTypeArgument[] = [];
    let resolvedBaseTypeName: string | undefined;
    let isCollection = false;
    let elementTypeName: string | undefined;
    let elementTypeSourceFile: SourceFile | undefined;
    let elementTypeArguments: ScannedTypeArgument[] = [];
    let elementResolvedBaseTypeName: string | undefined;

    if (typeNode) {
      typeName = typeNode.getText();
      const paramType = param.getType();

      // Detect array types: T[] or Array<T>
      if (paramType.isArray()) {
        isCollection = true;
        const elementType = paramType.getArrayElementTypeOrThrow();
        const elemResolved = resolveTypeSymbol(elementType, cache);
        if (elemResolved.symbolName) {
          elementTypeName = elemResolved.symbolName;
          elementTypeSourceFile = elemResolved.sourceFile;
          elementResolvedBaseTypeName = elemResolved.symbolName;
        } else {
          elementTypeName = elementType.getText();
        }
        elementTypeArguments = extractTypeArguments(elementType, cache);
      } else {
        const resolved = resolveTypeSymbol(paramType, cache);
        typeSourceFile = resolved.sourceFile;
        resolvedBaseTypeName = resolved.symbolName;
        typeArguments = extractTypeArguments(paramType, cache);
      }
    }

    return {
      paramName: param.getName(),
      typeName,
      typeSourceFile,
      typeArguments,
      resolvedBaseTypeName,
      isCollection,
      elementTypeName,
      elementTypeSourceFile,
      elementTypeArguments,
      elementResolvedBaseTypeName,
      sourceLocation: getSourceLocation(param, param.getSourceFile()),
    };
  });
}

function scanFieldInjections(
  cls: ClassDeclaration,
  cache: TypeResolutionCache,
): ScannedFieldInjection[] {
  const results: ScannedFieldInjection[] = [];

  for (const prop of cls.getProperties()) {
    const decorators = prop.getDecorators();
    const injectDec = findDecorator(decorators, DECORATOR_NAMES.Inject);
    const optionalDec = findDecorator(decorators, DECORATOR_NAMES.Optional);

    if (!injectDec && !optionalDec) continue;

    const hasAccessor = prop.hasAccessorKeyword?.() ?? false;
    if (!hasAccessor && !injectDec && !optionalDec) continue;

    let qualifier: string | undefined;
    if (injectDec) {
      const args = injectDec.getArguments();
      if (args.length > 0) {
        const argText = args[0].getText();
        // String literal: 'name' or "name"
        if (
          (argText.startsWith("'") && argText.endsWith("'")) ||
          (argText.startsWith('"') && argText.endsWith('"'))
        ) {
          qualifier = argText.slice(1, -1);
        } else {
          // InjectionToken variable reference — store the identifier text
          qualifier = argText;
        }
      }
    }

    const typeNode = prop.getTypeNode();
    let typeName: string | undefined;
    let typeSourceFile: SourceFile | undefined;
    let typeArguments: ScannedTypeArgument[] = [];
    let resolvedBaseTypeName: string | undefined;

    if (typeNode) {
      typeName = typeNode.getText();
      const propType = prop.getType();
      const resolved = resolveTypeSymbol(propType, cache);
      typeSourceFile = resolved.sourceFile;
      resolvedBaseTypeName = resolved.symbolName;
      typeArguments = extractTypeArguments(propType, cache);
    }

    results.push({
      fieldName: String(prop.getName()),
      qualifier,
      optional: optionalDec !== undefined,
      typeName,
      typeSourceFile,
      typeArguments,
      resolvedBaseTypeName,
      sourceLocation: getSourceLocation(prop, prop.getSourceFile()),
    });
  }

  return results;
}

function scanProvidesMethods(
  cls: ClassDeclaration,
  sourceFile: SourceFile,
  cache: TypeResolutionCache,
): ScannedProvides[] {
  const results: ScannedProvides[] = [];

  for (const method of cls.getMethods()) {
    const decorators = method.getDecorators();
    if (!hasDecorator(decorators, DECORATOR_NAMES.Provides)) continue;

    const returnTypeNode = method.getReturnTypeNode();
    let returnTypeName: string | undefined;
    let returnTypeSourceFile: SourceFile | undefined;
    let returnTypeArguments: ScannedTypeArgument[] = [];
    let returnResolvedBaseTypeName: string | undefined;

    if (returnTypeNode) {
      returnTypeName = returnTypeNode.getText();
      const returnType = method.getReturnType();
      const resolved = resolveTypeSymbol(returnType, cache);
      returnTypeSourceFile = resolved.sourceFile;
      returnResolvedBaseTypeName = resolved.symbolName;
      returnTypeArguments = extractTypeArguments(returnType, cache);
    }

    const params = method.getParameters().map((param) => {
      const typeNode = param.getTypeNode();
      let typeName: string | undefined;
      let typeSourceFile: SourceFile | undefined;
      let typeArguments: ScannedTypeArgument[] = [];
      let resolvedBaseTypeName: string | undefined;

      if (typeNode) {
        typeName = typeNode.getText();
        const paramType = param.getType();
        const resolved = resolveTypeSymbol(paramType, cache);
        typeSourceFile = resolved.sourceFile;
        resolvedBaseTypeName = resolved.symbolName;
        typeArguments = extractTypeArguments(paramType, cache);
      }

      return {
        paramName: param.getName(),
        typeName,
        typeSourceFile,
        typeArguments,
        resolvedBaseTypeName,
        isCollection: false,
        elementTypeName: undefined,
        elementTypeSourceFile: undefined,
        elementTypeArguments: [],
        elementResolvedBaseTypeName: undefined,
        sourceLocation: getSourceLocation(param, param.getSourceFile()),
      };
    });

    results.push({
      methodName: method.getName(),
      returnTypeName,
      returnTypeSourceFile,
      returnTypeArguments,
      returnResolvedBaseTypeName,
      params,
      eager: hasDecorator(decorators, DECORATOR_NAMES.Eager),
      sourceLocation: getSourceLocation(method, sourceFile),
    });
  }

  return results;
}

// ── Public member extraction (for scoped proxy generation) ──

/**
 * Extract all public non-lifecycle members from a class and its parent chain.
 * Walks up the inheritance hierarchy (stopping at node_modules boundaries)
 * and collects getters, methods, and properties, skipping private/protected,
 * constructors, and lifecycle methods (@OnInit, @OnDestroy).
 */
function extractPublicMembers(
  cls: ClassDeclaration,
  lifecycle: { preDestroy: string[]; postConstruct: string[] },
): ScannedPublicMember[] {
  const members: ScannedPublicMember[] = [];
  const seen = new Set<string>();
  const lifecycleMethods = new Set([
    ...lifecycle.preDestroy,
    ...lifecycle.postConstruct,
  ]);

  let current: ClassDeclaration | undefined = cls;
  while (current) {
    // Getters
    for (const getter of current.getGetAccessors()) {
      const name = getter.getName();
      if (seen.has(name)) continue;
      if (getter.getScope() === 'private' || getter.getScope() === 'protected')
        continue;
      seen.add(name);
      members.push({ name, kind: 'getter' });
    }

    // Methods (excluding lifecycle)
    for (const method of current.getMethods()) {
      const name = method.getName();
      if (seen.has(name)) continue;
      if (method.getScope() === 'private' || method.getScope() === 'protected')
        continue;
      if (lifecycleMethods.has(name)) continue;
      seen.add(name);
      members.push({ name, kind: 'method' });
    }

    // Properties (all public, including plain fields and accessor properties)
    for (const prop of current.getProperties()) {
      const name = String(prop.getName());
      if (seen.has(name)) continue;
      if (prop.getScope() === 'private' || prop.getScope() === 'protected')
        continue;
      seen.add(name);
      members.push({ name, kind: 'property' });
    }

    // Walk up inheritance chain
    const baseClass = current.getBaseClass();
    if (!baseClass) break;
    const filePath = baseClass.getSourceFile().getFilePath();
    if (filePath.includes('node_modules') || filePath.includes('/lib.')) break;
    current = baseClass;
  }

  return members;
}

// ── Lifecycle method scanning (@OnDestroy + @OnInit in one pass) ──

function scanLifecycleMethods(cls: ClassDeclaration): {
  preDestroy: string[];
  postConstruct: string[];
} {
  const preDestroy: string[] = [];
  const postConstruct: string[] = [];
  for (const method of cls.getMethods()) {
    const decorators = method.getDecorators();
    if (hasDecorator(decorators, DECORATOR_NAMES.OnDestroy)) {
      preDestroy.push(method.getName());
    }
    if (hasDecorator(decorators, DECORATOR_NAMES.OnInit)) {
      postConstruct.push(method.getName());
    }
  }
  return { preDestroy, postConstruct };
}

// ── @Value scanning ──

function scanValueFields(cls: ClassDeclaration): ScannedValueField[] {
  const results: ScannedValueField[] = [];

  for (const prop of cls.getProperties()) {
    const decorators = prop.getDecorators();
    const valueDec = findDecorator(decorators, DECORATOR_NAMES.Value);
    if (!valueDec) continue;

    const hasAccessor = prop.hasAccessorKeyword?.() ?? false;
    if (!hasAccessor) {
      throw new InvalidDecoratorUsageError(
        'Value',
        `@Value() must be applied to an accessor property. Change "${prop.getName()}" in ${cls.getName()} to use the accessor keyword: accessor ${prop.getName()}`,
        getSourceLocation(prop, prop.getSourceFile()),
      );
    }

    const args = valueDec.getArguments();
    if (args.length === 0) {
      throw new InvalidDecoratorUsageError(
        'Value',
        `@Value() requires a config key argument. Use @Value('KEY_NAME') on "${prop.getName()}" in ${cls.getName()}.`,
        getSourceLocation(prop, prop.getSourceFile()),
      );
    }

    // First argument is the config key (string literal)
    const keyArg = args[0].getText();
    let key: string;
    if (
      (keyArg.startsWith("'") && keyArg.endsWith("'")) ||
      (keyArg.startsWith('"') && keyArg.endsWith('"'))
    ) {
      key = keyArg.slice(1, -1);
    } else {
      key = keyArg;
    }

    // Second argument is optional: { default: ... }
    let defaultValue: string | undefined;
    if (args.length > 1) {
      const optArg = args[1];
      if (optArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const objLiteral = optArg.asKind(SyntaxKind.ObjectLiteralExpression);
        if (objLiteral) {
          const defaultProp = objLiteral.getProperty('default');
          if (defaultProp) {
            const initializer = defaultProp
              .asKind(SyntaxKind.PropertyAssignment)
              ?.getInitializer();
            if (initializer) {
              defaultValue = initializer.getText();
            }
          }
        }
      }
    }

    results.push({
      fieldName: String(prop.getName()),
      key,
      defaultValue,
    });
  }

  return results;
}

// ── Base class extraction ──

/**
 * Walk the inheritance chain and return all ancestor classes that exist
 * in project source files (not from node_modules / lib).
 * Direct parent first, root last. Stops when a class is from node_modules
 * or has no further base class.
 */
function extractBaseClasses(cls: ClassDeclaration): ClassTokenRef[] {
  const result: ClassTokenRef[] = [];
  const seen = new Set<string>();
  let current: ClassDeclaration | undefined = cls;

  while (current) {
    const baseClass = current.getBaseClass();
    if (!baseClass) break;

    const baseName = baseClass.getName();
    if (!baseName) break;
    if (seen.has(baseName)) break;
    seen.add(baseName);

    const baseSourceFile = baseClass.getSourceFile();
    const filePath = baseSourceFile.getFilePath();

    // Stop at classes from node_modules or TypeScript lib files
    if (filePath.includes('node_modules') || filePath.includes('/lib.')) {
      break;
    }

    result.push({
      kind: 'class',
      className: baseName,
      importPath: filePath,
    });

    current = baseClass;
  }

  return result;
}

// ── Type resolution helpers (with memoization) ──

/** Resolve a type's symbol name and source file, with caching. */
function resolveTypeSymbol(
  type: Type,
  cache: TypeResolutionCache,
): ResolvedTypeInfo {
  const symbol = type.getSymbol();
  if (!symbol) return { symbolName: undefined, sourceFile: undefined };

  const decls = symbol.getDeclarations();
  if (decls.length === 0) {
    return { symbolName: symbol.getName(), sourceFile: undefined };
  }

  const decl = decls[0];
  const key = `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`;
  const cached = cache.symbols.get(key);
  if (cached) return cached;

  const result: ResolvedTypeInfo = {
    symbolName: symbol.getName(),
    sourceFile: decl.getSourceFile(),
  };
  cache.symbols.set(key, result);
  return result;
}

/** Extract type arguments from a ts-morph Type, recursively for nested generics. */
function extractTypeArguments(
  type: Type,
  cache: TypeResolutionCache,
): ScannedTypeArgument[] {
  const typeArgs = type.getTypeArguments();
  if (typeArgs.length === 0) return [];

  const symbolPath =
    type.getSymbol()?.getDeclarations()?.[0]?.getSourceFile().getFilePath() ??
    '';
  const cacheKey = `${type.getText()}@${symbolPath}`;
  const cached = cache.typeArgs.get(cacheKey);
  if (cached) return cached;

  const result = typeArgs.map((arg) => {
    const resolved = resolveTypeSymbol(arg, cache);

    return {
      typeName: resolved.symbolName ?? arg.getText(),
      typeSourceFile: resolved.sourceFile,
      typeArguments: extractTypeArguments(arg, cache),
    };
  });
  cache.typeArgs.set(cacheKey, result);
  return result;
}

// ── Decorator import resolution ──

/**
 * Resolve the import path of each decorator on a class.
 * Traces the decorator call expression back to its declaration's source file.
 */
function resolveDecoratorImports(decorators: Decorator[]): IRDecoratorEntry[] {
  const results: IRDecoratorEntry[] = [];

  for (const dec of decorators) {
    const name = dec.getName();
    const callExpr = dec.getCallExpression();
    if (!callExpr) {
      // Decorator without call expression (bare @Foo) — rare, skip
      continue;
    }

    const expr = callExpr.getExpression();
    const symbol = expr.getSymbol();
    if (!symbol) continue;

    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) continue;

    const declSourceFile = declarations[0].getSourceFile();
    const filePath = declSourceFile.getFilePath();

    results.push({ name, importPath: filePath });
  }

  return results;
}

// ── Decorator helpers ──

function hasDecorator(decorators: Decorator[], name: string): boolean {
  return findDecorator(decorators, name) !== undefined;
}

function findDecorator(
  decorators: Decorator[],
  name: string,
): Decorator | undefined {
  return decorators.find((d) => d.getName() === name);
}

function getNamedValue(decorators: Decorator[]): string | undefined {
  const dec = findDecorator(decorators, DECORATOR_NAMES.Named);
  if (!dec) return undefined;

  const args = dec.getArguments();
  if (args.length === 0) return undefined;

  const text = args[0].getText();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

// ── Source location ──

function getSourceLocation(
  node: { getStartLineNumber(): number; getStart(): number },
  sourceFile: SourceFile,
): SourceLocation {
  const line = node.getStartLineNumber();
  const start = node.getStart();
  const { column } = sourceFile.getLineAndColumnAtPos(start);
  return {
    filePath: sourceFile.getFilePath(),
    line,
    column,
  };
}
