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
import { InvalidDecoratorUsageError } from './transformer-errors.js';

/** Names of decorators we recognize from @goodie-ts/decorators. */
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
  Value: 'Value',
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
  /** Fields decorated with @Value('key'). */
  valueFields: ScannedValueField[];
  /** All ancestor classes (direct parent first, root last). */
  baseClasses: Array<{ className: string; sourceFile: SourceFile | undefined }>;
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
  sourceLocation: SourceLocation;
}

/** Result of scanning source files. */
export interface ScanResult {
  beans: ScannedBean[];
  modules: ScannedModule[];
  warnings: string[];
}

/** Scan a ts-morph Project for decorated classes. */
export function scan(project: Project): ScanResult {
  const beans: ScannedBean[] = [];
  const modules: ScannedModule[] = [];
  const warnings: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const decorators = cls.getDecorators();
      if (decorators.length === 0) continue;

      const isModule = hasDecorator(decorators, DECORATOR_NAMES.Module);
      const isInjectable = hasDecorator(decorators, DECORATOR_NAMES.Injectable);
      const isSingleton = hasDecorator(decorators, DECORATOR_NAMES.Singleton);

      if ((isModule || isInjectable || isSingleton) && cls.isAbstract()) {
        const decoratorName = isModule
          ? 'Module'
          : isSingleton
            ? 'Singleton'
            : 'Injectable';
        throw new InvalidDecoratorUsageError(
          decoratorName,
          `Cannot apply @${decoratorName}() to abstract class "${cls.getName()}". Abstract classes cannot be instantiated. Remove the decorator or make the class concrete.`,
          getSourceLocation(cls, sourceFile),
        );
      }

      if (isModule) {
        const scannedModule = scanModule(cls, decorators, sourceFile);
        if (scannedModule) modules.push(scannedModule);
      } else if (isInjectable || isSingleton) {
        const scannedBean = scanBean(cls, decorators, sourceFile, isSingleton);
        if (scannedBean) beans.push(scannedBean);
      }
    }
  }

  return { beans, modules, warnings };
}

function scanBean(
  cls: ClassDeclaration,
  decorators: Decorator[],
  sourceFile: SourceFile,
  isSingleton: boolean,
): ScannedBean | undefined {
  const className = cls.getName();
  if (!className) return undefined;

  const scope: Scope = isSingleton ? 'singleton' : 'prototype';
  const eager = hasDecorator(decorators, DECORATOR_NAMES.Eager);
  const name = getNamedValue(decorators);
  const constructorParams = scanConstructorParams(cls);
  const fieldInjections = scanFieldInjections(cls);
  const preDestroyMethods = scanPreDestroyMethods(cls);
  const postConstructMethods = scanPostConstructMethods(cls);
  const valueFields = scanValueFields(cls);
  const baseClasses = extractBaseClassChain(cls);

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
    preDestroyMethods,
    postConstructMethods,
    valueFields,
    baseClasses,
    sourceLocation: getSourceLocation(cls, sourceFile),
  };
}

function scanModule(
  cls: ClassDeclaration,
  decorators: Decorator[],
  sourceFile: SourceFile,
): ScannedModule | undefined {
  const className = cls.getName();
  if (!className) return undefined;

  const moduleDecorator = findDecorator(decorators, DECORATOR_NAMES.Module)!;
  const imports = getModuleImports(moduleDecorator);
  const provides = scanProvidesMethods(cls, sourceFile);

  return {
    classDeclaration: cls,
    classTokenRef: {
      kind: 'class',
      className,
      importPath: sourceFile.getFilePath(),
    },
    imports,
    provides,
    sourceLocation: getSourceLocation(cls, sourceFile),
  };
}

function scanConstructorParams(
  cls: ClassDeclaration,
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
        const elemSymbol = elementType.getSymbol();
        if (elemSymbol) {
          elementTypeName = elemSymbol.getName();
          const decls = elemSymbol.getDeclarations();
          if (decls.length > 0) {
            elementTypeSourceFile = decls[0].getSourceFile();
          }
          elementResolvedBaseTypeName = elemSymbol.getName();
        } else {
          elementTypeName = elementType.getText();
        }
        elementTypeArguments = extractTypeArguments(elementType);
      }

      const typeSymbol = paramType.getSymbol();
      if (typeSymbol) {
        const decls = typeSymbol.getDeclarations();
        if (decls.length > 0) {
          typeSourceFile = decls[0].getSourceFile();
        }
        resolvedBaseTypeName = typeSymbol.getName();
      }
      typeArguments = extractTypeArguments(paramType);
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

function scanFieldInjections(cls: ClassDeclaration): ScannedFieldInjection[] {
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
      const typeSymbol = propType.getSymbol();
      if (typeSymbol) {
        const decls = typeSymbol.getDeclarations();
        if (decls.length > 0) {
          typeSourceFile = decls[0].getSourceFile();
        }
        resolvedBaseTypeName = typeSymbol.getName();
      }
      typeArguments = extractTypeArguments(propType);
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
      const typeSymbol = returnType.getSymbol();
      if (typeSymbol) {
        const decls = typeSymbol.getDeclarations();
        if (decls.length > 0) {
          returnTypeSourceFile = decls[0].getSourceFile();
        }
        returnResolvedBaseTypeName = typeSymbol.getName();
      }
      returnTypeArguments = extractTypeArguments(returnType);
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
        const typeSymbol = paramType.getSymbol();
        if (typeSymbol) {
          const decls = typeSymbol.getDeclarations();
          if (decls.length > 0) {
            typeSourceFile = decls[0].getSourceFile();
          }
          resolvedBaseTypeName = typeSymbol.getName();
        }
        typeArguments = extractTypeArguments(paramType);
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
      sourceLocation: getSourceLocation(method, sourceFile),
    });
  }

  return results;
}

// ── @PreDestroy scanning ──

function scanPreDestroyMethods(cls: ClassDeclaration): string[] {
  const methods: string[] = [];
  for (const method of cls.getMethods()) {
    const decorators = method.getDecorators();
    if (hasDecorator(decorators, DECORATOR_NAMES.PreDestroy)) {
      methods.push(method.getName());
    }
  }
  return methods;
}

// ── @PostConstruct scanning ──

function scanPostConstructMethods(cls: ClassDeclaration): string[] {
  const methods: string[] = [];
  for (const method of cls.getMethods()) {
    const decorators = method.getDecorators();
    if (hasDecorator(decorators, DECORATOR_NAMES.PostConstruct)) {
      methods.push(method.getName());
    }
  }
  return methods;
}

// ── @Value scanning ──

function scanValueFields(cls: ClassDeclaration): ScannedValueField[] {
  const results: ScannedValueField[] = [];

  for (const prop of cls.getProperties()) {
    const decorators = prop.getDecorators();
    const valueDec = findDecorator(decorators, DECORATOR_NAMES.Value);
    if (!valueDec) continue;

    const args = valueDec.getArguments();
    if (args.length === 0) continue;

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
 * Walk the full inheritance chain and return all ancestor classes
 * (direct parent first, root last).
 */
function extractBaseClassChain(
  cls: ClassDeclaration,
): Array<{ className: string; sourceFile: SourceFile | undefined }> {
  const result: Array<{
    className: string;
    sourceFile: SourceFile | undefined;
  }> = [];
  const seen = new Set<string>();
  let current: ClassDeclaration | undefined = cls;

  while (current) {
    const extendsExpr = current.getExtends();
    if (!extendsExpr) break;

    const baseType = extendsExpr.getType();
    const symbol = baseType.getSymbol();
    if (!symbol) break;

    const className = symbol.getName();
    if (seen.has(className)) break; // guard against cycles
    seen.add(className);

    let sourceFile: SourceFile | undefined;
    const decls = symbol.getDeclarations();
    if (decls.length > 0) {
      sourceFile = decls[0].getSourceFile();
    }

    result.push({ className, sourceFile });

    // Try to get the ClassDeclaration for the parent to continue walking
    const parentDecl = decls.find(
      (d) => d.getKindName() === 'ClassDeclaration',
    );
    current = parentDecl as ClassDeclaration | undefined;
  }

  return result;
}

// ── Generic type helpers ──

/** Extract type arguments from a ts-morph Type, recursively for nested generics. */
function extractTypeArguments(type: Type): ScannedTypeArgument[] {
  const typeArgs = type.getTypeArguments();
  if (typeArgs.length === 0) return [];

  return typeArgs.map((arg) => {
    const symbol = arg.getSymbol();
    let typeSourceFile: SourceFile | undefined;
    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls.length > 0) {
        typeSourceFile = decls[0].getSourceFile();
      }
    }

    return {
      typeName: symbol?.getName() ?? arg.getText(),
      typeSourceFile,
      typeArguments: extractTypeArguments(arg),
    };
  });
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
