import type {
  IRBeanDefinition,
  IRDependency,
  IRFieldInjection,
  SourceLocation,
  TokenRef,
} from './ir.js';
import type {
  ScannedBean,
  ScannedConstructorParam,
  ScannedFieldInjection,
  ScannedTypeArgument,
  ScanResult,
} from './scanner.js';
import { UnresolvableTypeError } from './transformer-errors.js';

/** Result of the resolver stage. */
export interface ResolveResult {
  beans: IRBeanDefinition[];
  warnings: string[];
}

/** Primitive types that cannot be used as constructor tokens. */
const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'symbol',
  'bigint',
  'undefined',
  'null',
  'void',
  'never',
  'any',
  'unknown',
  'object',
]);

/**
 * Resolve scanned AST information into typed IR.
 * Converts raw type names and source files into TokenRefs.
 *
 * Beans with @Provides methods are expanded inline: the bean itself is
 * registered as a singleton, and each @Provides method becomes a separate
 * bean with `factoryKind: 'provides'`.
 */
export function resolve(scanResult: ScanResult): ResolveResult {
  const warnings: string[] = [...scanResult.warnings];
  const beans: IRBeanDefinition[] = [];

  for (const scanned of scanResult.beans) {
    beans.push(...resolveBean(scanned, warnings));
  }

  return { beans, warnings };
}

function resolveBean(
  scanned: ScannedBean,
  _warnings: string[],
): IRBeanDefinition[] {
  const constructorDeps = resolveConstructorParams(
    scanned.constructorParams,
    scanned.classTokenRef.className,
  );

  const fieldDeps = resolveFieldInjections(
    scanned.fieldInjections,
    scanned.classTokenRef.className,
  );

  const metadata: Record<string, unknown> = {};
  if (scanned.preDestroyMethods.length > 0) {
    metadata.preDestroyMethods = scanned.preDestroyMethods;
  }
  if (scanned.postConstructMethods.length > 0) {
    metadata.postConstructMethods = scanned.postConstructMethods;
  }
  if (scanned.isBeanPostProcessor) {
    metadata.isBeanPostProcessor = true;
  }
  if (scanned.valueFields.length > 0) {
    metadata.valueFields = scanned.valueFields.map((vf) => ({
      fieldName: vf.fieldName,
      key: vf.key,
      default: vf.defaultValue,
    }));
  }
  if (scanned.isModule) {
    metadata.isModule = true;
  }

  const beanDef: IRBeanDefinition = {
    tokenRef: scanned.classTokenRef,
    scope: scanned.scope,
    eager: scanned.eager,
    name: scanned.name,
    constructorDeps,
    fieldDeps,
    factoryKind: 'constructor',
    providesSource: undefined,
    baseTokenRefs:
      scanned.baseClasses.length > 0 ? scanned.baseClasses : undefined,
    decorators: scanned.decorators.length > 0 ? scanned.decorators : undefined,
    methodDecorators:
      Object.keys(scanned.methodDecorators).length > 0
        ? scanned.methodDecorators
        : undefined,
    publicMembers: scanned.publicMembers,
    metadata,
    sourceLocation: scanned.sourceLocation,
  };

  const result: IRBeanDefinition[] = [beanDef];

  // Expand @Provides methods into separate beans
  if (scanned.provides.length > 0) {
    const providesBeans = expandProvides(scanned, beanDef);
    result.push(...providesBeans);
  }

  return result;
}

/**
 * Expand @Provides methods on a bean into separate IRBeanDefinition entries.
 * Each @Provides method becomes a bean with `factoryKind: 'provides'` whose
 * first constructor dependency is the owning bean instance.
 */
function expandProvides(
  scanned: ScannedBean,
  ownerBean: IRBeanDefinition,
): IRBeanDefinition[] {
  const className = scanned.classTokenRef.className;

  // Two-pass provides resolution:
  // Pass 1: resolve return types to get each method's tokenRef
  const providesWithTokens = scanned.provides.map((p) => ({
    scanned: p,
    tokenRef: resolveProvidesReturnType(
      p.returnTypeName,
      p.returnTypeSourceFile,
      p.returnTypeArguments,
      p.returnResolvedBaseTypeName,
      p.methodName,
      className,
      p.sourceLocation,
    ),
  }));

  // Build a map of return type name → provides entries for primitive param resolution
  const providesByReturnType = new Map<
    string,
    Array<{ methodName: string; tokenRef: TokenRef }>
  >();
  for (const entry of providesWithTokens) {
    const returnTypeName = entry.scanned.returnTypeName;
    if (returnTypeName && isPrimitiveType(returnTypeName)) {
      const existing = providesByReturnType.get(returnTypeName) ?? [];
      existing.push({
        methodName: entry.scanned.methodName,
        tokenRef: entry.tokenRef,
      });
      providesByReturnType.set(returnTypeName, existing);
    }
  }

  // Pass 2: resolve params and create bean definitions
  return providesWithTokens.map(({ scanned: p, tokenRef }) => {
    const dependencies = resolveProvidesParams(
      p.params,
      `${className}.${p.methodName}`,
      providesByReturnType,
    );

    // Owner bean instance is the implicit first dependency
    const ownerDep: IRDependency = {
      tokenRef: ownerBean.tokenRef,
      optional: false,
      collection: false,
      sourceLocation: p.sourceLocation,
    };

    // When a @Provides returns a class type (resolved to InjectionToken with
    // typeImports), track the return type class as a baseTokenRef so that
    // collection injection via getAll(ReturnTypeClass) discovers this bean.
    let baseTokenRefs: import('./ir.js').ClassTokenRef[] | undefined;
    if (
      tokenRef.kind === 'injection-token' &&
      tokenRef.typeAnnotation &&
      tokenRef.typeImports?.size
    ) {
      const returnClassName = tokenRef.typeAnnotation;
      const returnImportPath = tokenRef.typeImports.get(returnClassName);
      if (returnImportPath) {
        baseTokenRefs = [
          {
            kind: 'class',
            className: returnClassName,
            importPath: returnImportPath,
          },
        ];
      }
    }

    return {
      tokenRef,
      scope: 'singleton' as const,
      eager: p.eager,
      name: undefined,
      constructorDeps: [ownerDep, ...dependencies],
      fieldDeps: [],
      factoryKind: 'provides' as const,
      providesSource: {
        moduleTokenRef: scanned.classTokenRef,
        methodName: p.methodName,
      },
      baseTokenRefs,
      metadata: {},
      sourceLocation: p.sourceLocation,
    };
  });
}

/**
 * Resolve @Provides method parameters, with special handling for primitives.
 * Primitive-typed params are matched to other @Provides methods that return that type.
 *
 * Note: primitive param resolution is scoped to the owning bean's @Provides methods.
 * A primitive @Provides on bean X cannot be auto-wired as a param of bean Y's @Provides.
 * Cross-bean primitive wiring requires an explicit InjectionToken.
 */
function resolveProvidesParams(
  params: ScannedConstructorParam[],
  ownerName: string,
  providesByReturnType: Map<
    string,
    Array<{ methodName: string; tokenRef: TokenRef }>
  >,
): IRDependency[] {
  return params.map((param) => {
    if (!param.typeName) {
      throw new UnresolvableTypeError(
        `parameter "${param.paramName}" of ${ownerName} — type could not be inferred. Add an explicit type annotation.`,
        param.sourceLocation,
      );
    }

    // Primitive param → look up matching @Provides by return type
    if (isPrimitiveType(param.typeName)) {
      const candidates = providesByReturnType.get(param.typeName);

      if (!candidates || candidates.length === 0) {
        throw new UnresolvableTypeError(
          `${param.typeName} (parameter "${param.paramName}" of ${ownerName}) — no @Provides method returns this type. Use an InjectionToken or add a @Provides method that returns ${param.typeName}.`,
          param.sourceLocation,
        );
      }

      if (candidates.length === 1) {
        return {
          tokenRef: candidates[0].tokenRef,
          optional: false,
          collection: false,
          sourceLocation: param.sourceLocation,
        };
      }

      // Multiple providers of same type → disambiguate by param name matching method name
      const match = candidates.find((c) => c.methodName === param.paramName);
      if (match) {
        return {
          tokenRef: match.tokenRef,
          optional: false,
          collection: false,
          sourceLocation: param.sourceLocation,
        };
      }

      throw new UnresolvableTypeError(
        `${param.typeName} (parameter "${param.paramName}" of ${ownerName}) — multiple providers exist, use parameter name matching a @Provides method name to disambiguate`,
        param.sourceLocation,
      );
    }

    // Non-primitive → standard resolution
    return resolveConstructorParam(param, ownerName);
  });
}

/**
 * Resolve the return type of a @Provides method to a TokenRef.
 * - Generic class types → InjectionTokenRef with canonical key
 * - Non-generic class types → ClassTokenRef
 * - Primitives/interfaces → InjectionTokenRef with method name
 */
function resolveProvidesReturnType(
  typeName: string | undefined,
  typeSourceFile: { getFilePath(): string } | undefined,
  typeArguments: ScannedTypeArgument[],
  resolvedBaseTypeName: string | undefined,
  methodName: string,
  ownerClassName: string,
  _sourceLocation: SourceLocation,
): TokenRef {
  if (!typeName || isPrimitiveType(typeName)) {
    // Auto-generate InjectionToken from method name
    return {
      kind: 'injection-token',
      tokenName: methodName,
      importPath: undefined,
      typeAnnotation: typeName,
    };
  }

  // Generic return type → InjectionTokenRef with canonical name
  if (typeArguments.length > 0 && resolvedBaseTypeName && typeSourceFile) {
    const canonicalName = canonicalizeGenericType(
      resolvedBaseTypeName,
      typeArguments,
    );
    const typeImports = collectTypeImports(
      resolvedBaseTypeName,
      typeSourceFile,
      typeArguments,
    );
    return {
      kind: 'injection-token',
      tokenName: canonicalName,
      importPath: typeSourceFile.getFilePath(),
      typeAnnotation: canonicalName,
      typeImports,
    };
  }

  // Non-generic class return type → generate a unique InjectionToken
  // namespaced by the owning class to avoid conflicts when multiple
  // modules provide the same return type. The class itself is tracked
  // via baseTokenRefs in expandProvides() for collection discovery.
  if (typeSourceFile) {
    const className = resolvedBaseTypeName ?? typeName;
    return {
      kind: 'injection-token',
      tokenName: `${ownerClassName}.${methodName}`,
      importPath: typeSourceFile.getFilePath(),
      typeAnnotation: className,
      typeImports: new Map([[className, typeSourceFile.getFilePath()]]),
    };
  }

  // Interface or unresolvable type → use method name as token
  return {
    kind: 'injection-token',
    tokenName: methodName,
    importPath: undefined,
    typeAnnotation: typeName,
  };
}

function resolveConstructorParams(
  params: ScannedConstructorParam[],
  ownerName: string,
): IRDependency[] {
  return params.map((param) => resolveConstructorParam(param, ownerName));
}

function resolveConstructorParam(
  param: ScannedConstructorParam,
  ownerName: string,
): IRDependency {
  if (!param.typeName) {
    throw new UnresolvableTypeError(
      `parameter "${param.paramName}" of ${ownerName} — type could not be inferred. Add an explicit type annotation.`,
      param.sourceLocation,
    );
  }

  // Collection injection: T[] or Array<T>
  if (param.isCollection && param.elementTypeName) {
    if (isPrimitiveType(param.elementTypeName)) {
      throw new UnresolvableTypeError(
        `${param.typeName} (parameter "${param.paramName}" of ${ownerName}) — collection injection of primitive types is not supported`,
        param.sourceLocation,
      );
    }

    const tokenRef = resolveTypeToTokenRef(
      param.elementTypeName,
      param.elementTypeSourceFile,
      param.elementTypeArguments,
      param.elementResolvedBaseTypeName,
      param.sourceLocation,
    );

    return {
      tokenRef,
      optional: false,
      collection: true,
      sourceLocation: param.sourceLocation,
    };
  }

  if (isPrimitiveType(param.typeName)) {
    throw new UnresolvableTypeError(
      `${param.typeName} (parameter "${param.paramName}" of ${ownerName}) — primitive types cannot be auto-wired. Use an InjectionToken<${param.typeName}> or @Value('key') instead.`,
      param.sourceLocation,
    );
  }

  const tokenRef = resolveTypeToTokenRef(
    param.typeName,
    param.typeSourceFile,
    param.typeArguments,
    param.resolvedBaseTypeName,
    param.sourceLocation,
  );

  return {
    tokenRef,
    optional: false,
    collection: false,
    sourceLocation: param.sourceLocation,
  };
}

function resolveFieldInjections(
  fields: ScannedFieldInjection[],
  ownerName: string,
): IRFieldInjection[] {
  return fields.map((field) => resolveFieldInjection(field, ownerName));
}

function resolveFieldInjection(
  field: ScannedFieldInjection,
  ownerName: string,
): IRFieldInjection {
  let tokenRef: TokenRef;

  if (field.qualifier) {
    // @Inject('name') → we'll match against @Named beans later in graph-builder
    // For now, store as an injection-token with the qualifier as name
    tokenRef = {
      kind: 'injection-token',
      tokenName: field.qualifier,
      importPath: undefined,
    };
  } else if (field.typeName && !isPrimitiveType(field.typeName)) {
    tokenRef = resolveTypeToTokenRef(
      field.typeName,
      field.typeSourceFile,
      field.typeArguments,
      field.resolvedBaseTypeName,
      field.sourceLocation,
    );
  } else {
    const typeInfo = field.typeName
      ? ` (type: ${field.typeName}) — primitive types cannot be auto-wired. Use @Inject(token) on an accessor field.`
      : ' — type could not be inferred. Add an explicit type annotation or use @Inject(token).';
    throw new UnresolvableTypeError(
      `field "${field.fieldName}" of ${ownerName}${typeInfo}`,
      field.sourceLocation,
    );
  }

  return {
    fieldName: field.fieldName,
    tokenRef,
    optional: field.optional,
  };
}

function resolveTypeToTokenRef(
  typeName: string,
  typeSourceFile: { getFilePath(): string } | undefined,
  typeArguments: ScannedTypeArgument[],
  resolvedBaseTypeName: string | undefined,
  _sourceLocation: SourceLocation,
): TokenRef {
  // Generic type → always InjectionTokenRef with canonical key
  if (typeArguments.length > 0 && resolvedBaseTypeName && typeSourceFile) {
    const canonicalName = canonicalizeGenericType(
      resolvedBaseTypeName,
      typeArguments,
    );
    const typeImports = collectTypeImports(
      resolvedBaseTypeName,
      typeSourceFile,
      typeArguments,
    );
    return {
      kind: 'injection-token',
      tokenName: canonicalName,
      importPath: typeSourceFile.getFilePath(),
      typeAnnotation: canonicalName,
      typeImports,
    };
  }

  if (typeSourceFile) {
    return {
      kind: 'class',
      className: resolvedBaseTypeName ?? typeName,
      importPath: typeSourceFile.getFilePath(),
    };
  }

  // No source file means we can't find the class declaration — treat as interface
  return {
    kind: 'injection-token',
    tokenName: typeName,
    importPath: undefined,
  };
}

// ── Generic type canonicalization ──

/**
 * Build a canonical type name from a base name and type arguments.
 * E.g. canonicalizeGenericType('Repository', [{typeName: 'User', ...}]) → 'Repository<User>'
 */
function canonicalizeGenericType(
  baseName: string,
  typeArguments: ScannedTypeArgument[],
): string {
  if (typeArguments.length === 0) return baseName;
  const args = typeArguments.map(canonicalizeTypeArgument).join(', ');
  return `${baseName}<${args}>`;
}

/** Recursively canonicalize a type argument. */
function canonicalizeTypeArgument(arg: ScannedTypeArgument): string {
  if (arg.typeArguments.length === 0) return arg.typeName;
  const nested = arg.typeArguments.map(canonicalizeTypeArgument).join(', ');
  return `${arg.typeName}<${nested}>`;
}

function isPrimitiveType(typeName: string): boolean {
  return PRIMITIVE_TYPES.has(typeName);
}

/**
 * Collect type name → import path mappings from type arguments.
 * Walks the argument tree recursively.
 */
function collectTypeImports(
  baseTypeName: string | undefined,
  baseSourceFile: { getFilePath(): string } | undefined,
  typeArguments: ScannedTypeArgument[],
): Map<string, string> {
  const imports = new Map<string, string>();

  if (baseTypeName && baseSourceFile) {
    imports.set(baseTypeName, baseSourceFile.getFilePath());
  }

  function walk(args: ScannedTypeArgument[]): void {
    for (const arg of args) {
      if (arg.typeSourceFile) {
        imports.set(arg.typeName, arg.typeSourceFile.getFilePath());
      }
      walk(arg.typeArguments);
    }
  }

  walk(typeArguments);
  return imports;
}
