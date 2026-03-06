import type { Scope } from '@goodie-ts/core';
import {
  type ClassDeclaration,
  type Decorator,
  type Project,
  type SourceFile,
  SyntaxKind,
  type Type,
} from 'ts-morph';
import type { ClassTokenRef, SourceLocation } from './ir.js';
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
  Injectable: 'Injectable',
  Singleton: 'Singleton',
  Named: 'Named',
  Eager: 'Eager',
  Module: 'Module',
  Provides: 'Provides',
  Inject: 'Inject',
  Optional: 'Optional',
  PreDestroy: 'PreDestroy',
  PostConstruct: 'PostConstruct',
  PostProcessor: 'PostProcessor',
  Value: 'Value',
  Controller: 'Controller',
} as const;

/** A class decorated with @Injectable or @Singleton (but not @Module). */
export interface ScannedBean {
  classDeclaration: ClassDeclaration;
  classTokenRef: ClassTokenRef;
  scope: Scope;
  eager: boolean;
  name: string | undefined;
  constructorParams: ScannedConstructorParam[];
  fieldInjections: ScannedFieldInjection[];
  /** Method names decorated with @PreDestroy(). */
  preDestroyMethods: string[];
  /** Method names decorated with @PostConstruct(). */
  postConstructMethods: string[];
  /** Whether @PostProcessor() is present on this class. */
  isBeanPostProcessor: boolean;
  /** Fields decorated with @Value('key'). */
  valueFields: ScannedValueField[];
  /** Base classes this bean extends (for baseTokens registration). */
  baseClasses: ClassTokenRef[];
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

/** A @Module class with its @Provides methods. */
export interface ScannedModule {
  classDeclaration: ClassDeclaration;
  classTokenRef: ClassTokenRef;
  imports: ScannedModuleImport[];
  provides: ScannedProvides[];
  constructorParams: ScannedConstructorParam[];
  fieldInjections: ScannedFieldInjection[];
  sourceLocation: SourceLocation;
}

export interface ScannedModuleImport {
  className: string;
  sourceFile: SourceFile | undefined;
}

/** A @Provides method inside a @Module. */
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
  modules: ScannedModule[];
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
  const modules: ScannedModule[] = [];
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

      // Run plugin visitor hooks for any decorated class with a name
      if (hasVisitors) {
        const className = cls.getName();
        if (className) {
          const metadata: Record<string, unknown> = {};
          const metadataKey = `${filePath}:${className}`;
          pluginMetadata.set(metadataKey, metadata);

          const classCtx: ClassVisitorContext = {
            classDeclaration: cls,
            className,
            filePath,
            metadata,
          };
          for (const plugin of plugins!) {
            plugin.visitClass?.(classCtx);
          }

          for (const method of cls.getMethods()) {
            const methodCtx: MethodVisitorContext = {
              methodDeclaration: method,
              methodName: method.getName(),
              className,
              filePath,
              classMetadata: metadata,
            };
            for (const plugin of plugins!) {
              plugin.visitMethod?.(methodCtx);
            }
          }
        }
      }

      const isModule = hasDecorator(decorators, DECORATOR_NAMES.Module);
      const isInjectable = hasDecorator(decorators, DECORATOR_NAMES.Injectable);
      const isSingleton = hasDecorator(decorators, DECORATOR_NAMES.Singleton);
      const isPostProcessor = hasDecorator(
        decorators,
        DECORATOR_NAMES.PostProcessor,
      );
      const isController = hasDecorator(decorators, DECORATOR_NAMES.Controller);

      if (
        (isModule ||
          isInjectable ||
          isSingleton ||
          isPostProcessor ||
          isController) &&
        cls.isAbstract()
      ) {
        const decoratorName = isModule
          ? 'Module'
          : isController
            ? 'Controller'
            : isSingleton
              ? 'Singleton'
              : isPostProcessor
                ? 'PostProcessor'
                : 'Injectable';
        throw new InvalidDecoratorUsageError(
          decoratorName,
          `Cannot apply @${decoratorName}() to abstract class "${cls.getName()}". Abstract classes cannot be instantiated. Remove the decorator or make the class concrete.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isPostProcessor && isInjectable) {
        throw new InvalidDecoratorUsageError(
          'PostProcessor',
          `@PostProcessor cannot be combined with @Injectable — post-processors must be singletons. Use @PostProcessor() @Singleton() instead.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isController && isModule) {
        throw new InvalidDecoratorUsageError(
          'Controller',
          `@Controller cannot be combined with @Module on class "${cls.getName()}". Controllers and modules are separate concepts.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isController && isInjectable) {
        throw new InvalidDecoratorUsageError(
          'Controller',
          `@Controller cannot be combined with @Injectable on class "${cls.getName()}". Controllers are implicitly singletons — use @Controller() alone.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isController && isSingleton) {
        throw new InvalidDecoratorUsageError(
          'Controller',
          `@Controller cannot be combined with @Singleton on class "${cls.getName()}". Controllers are implicitly singletons — use @Controller() alone.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isController) {
        // Controllers are implicitly singletons — register as bean only.
        // Route scanning is done by the hono plugin via visitClass/visitMethod.
        const scannedBean = scanBean(
          cls,
          decorators,
          sourceFile,
          true,
          typeCache,
        );
        if (scannedBean) beans.push(scannedBean);
      } else if (isModule) {
        const scannedModule = scanModule(
          cls,
          decorators,
          sourceFile,
          typeCache,
        );
        if (scannedModule) modules.push(scannedModule);
      } else if (isInjectable || isSingleton || isPostProcessor) {
        const scannedBean = scanBean(
          cls,
          decorators,
          sourceFile,
          isSingleton || isPostProcessor,
          typeCache,
        );
        if (scannedBean) beans.push(scannedBean);
      }
    }
  }

  return {
    beans,
    modules,
    warnings,
    ...(hasVisitors ? { pluginMetadata } : {}),
  };
}

function scanBean(
  cls: ClassDeclaration,
  decorators: Decorator[],
  sourceFile: SourceFile,
  isSingleton: boolean,
  cache: TypeResolutionCache,
): ScannedBean | undefined {
  const className = cls.getName();
  if (!className) return undefined;

  const scope: Scope = isSingleton ? 'singleton' : 'prototype';
  const eager = hasDecorator(decorators, DECORATOR_NAMES.Eager);
  const name = getNamedValue(decorators);
  const constructorParams = scanConstructorParams(cls, cache);
  const fieldInjections = scanFieldInjections(cls, cache);
  const lifecycle = scanLifecycleMethods(cls);
  const isBeanPostProcessor = hasDecorator(
    decorators,
    DECORATOR_NAMES.PostProcessor,
  );
  const valueFields = scanValueFields(cls);
  const baseClasses = extractBaseClasses(cls);

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
    preDestroyMethods: lifecycle.preDestroy,
    postConstructMethods: lifecycle.postConstruct,
    isBeanPostProcessor,
    valueFields,
    baseClasses,
    sourceLocation: getSourceLocation(cls, sourceFile),
  };
}

function scanModule(
  cls: ClassDeclaration,
  decorators: Decorator[],
  sourceFile: SourceFile,
  cache: TypeResolutionCache,
): ScannedModule | undefined {
  const className = cls.getName();
  if (!className) return undefined;

  const moduleDecorator = findDecorator(decorators, DECORATOR_NAMES.Module)!;
  const imports = getModuleImports(moduleDecorator);
  const provides = scanProvidesMethods(cls, sourceFile, cache);
  const constructorParams = scanConstructorParams(cls, cache);
  const fieldInjections = scanFieldInjections(cls, cache);

  return {
    classDeclaration: cls,
    classTokenRef: {
      kind: 'class',
      className,
      importPath: sourceFile.getFilePath(),
    },
    imports,
    provides,
    constructorParams,
    fieldInjections,
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

// ── Lifecycle method scanning (@PreDestroy + @PostConstruct in one pass) ──

function scanLifecycleMethods(cls: ClassDeclaration): {
  preDestroy: string[];
  postConstruct: string[];
} {
  const preDestroy: string[] = [];
  const postConstruct: string[] = [];
  for (const method of cls.getMethods()) {
    const decorators = method.getDecorators();
    if (hasDecorator(decorators, DECORATOR_NAMES.PreDestroy)) {
      preDestroy.push(method.getName());
    }
    if (hasDecorator(decorators, DECORATOR_NAMES.PostConstruct)) {
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

function getModuleImports(decorator: Decorator): ScannedModuleImport[] {
  const args = decorator.getArguments();
  if (args.length === 0) return [];

  const arg = args[0];
  // The argument should be an object literal: { imports: [A, B] }
  if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return [];

  const objLiteral = arg.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!objLiteral) return [];

  const importsProp = objLiteral.getProperty('imports');
  if (!importsProp) return [];

  const initializer = importsProp
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();
  if (
    !initializer ||
    initializer.getKind() !== SyntaxKind.ArrayLiteralExpression
  )
    return [];

  const arrayLiteral = initializer.asKind(SyntaxKind.ArrayLiteralExpression);
  if (!arrayLiteral) return [];

  return arrayLiteral.getElements().map((element) => {
    const text = element.getText();
    const symbol = element.getType().getSymbol();
    let sourceFile: SourceFile | undefined;
    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls.length > 0) {
        sourceFile = decls[0].getSourceFile();
      }
    }
    return { className: text, sourceFile };
  });
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
