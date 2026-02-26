import type {
  ClassTokenRef,
  IRBeanDefinition,
  IRDependency,
  IRFieldInjection,
  IRModule,
  IRProvides,
  SourceLocation,
  TokenRef,
} from './ir.js';
import type {
  ScannedBean,
  ScannedConstructorParam,
  ScannedFieldInjection,
  ScannedModule,
  ScannedTypeArgument,
  ScanResult,
} from './scanner.js';
import { UnresolvableTypeError } from './transformer-errors.js';

/** Result of the resolver stage. */
export interface ResolveResult {
  beans: IRBeanDefinition[];
  modules: IRModule[];
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
 */
export function resolve(scanResult: ScanResult): ResolveResult {
  const warnings: string[] = [...scanResult.warnings];
  const beans: IRBeanDefinition[] = [];
  const modules: IRModule[] = [];

  // Resolve regular beans
  for (const scanned of scanResult.beans) {
    beans.push(resolveBean(scanned, warnings));
  }

  // Resolve modules
  for (const scannedModule of scanResult.modules) {
    modules.push(resolveModule(scannedModule, warnings));
  }

  return { beans, modules, warnings };
}

function resolveBean(
  scanned: ScannedBean,
  _warnings: string[],
): IRBeanDefinition {
  const constructorDeps = resolveConstructorParams(
    scanned.constructorParams,
    scanned.classTokenRef.className,
  );

  const fieldDeps = resolveFieldInjections(
    scanned.fieldInjections,
    scanned.classTokenRef.className,
  );

  const baseTokenRefs: ClassTokenRef[] = scanned.baseClasses
    .filter((bc) => bc.sourceFile !== undefined)
    .map(
      (bc) =>
        ({
          kind: 'class' as const,
          className: bc.className,
          importPath: bc.sourceFile!.getFilePath(),
        }) satisfies ClassTokenRef,
    );

  const metadata: Record<string, unknown> = {};
  if (scanned.preDestroyMethods.length > 0) {
    metadata.preDestroyMethods = scanned.preDestroyMethods;
  }
  if (scanned.postConstructMethods.length > 0) {
    metadata.postConstructMethods = scanned.postConstructMethods;
  }
  if (scanned.valueFields.length > 0) {
    metadata.valueFields = scanned.valueFields.map((vf) => ({
      fieldName: vf.fieldName,
      key: vf.key,
      default: vf.defaultValue,
    }));
  }

  return {
    tokenRef: scanned.classTokenRef,
    scope: scanned.scope,
    eager: scanned.eager,
    name: scanned.name,
    constructorDeps,
    fieldDeps,
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata,
    baseTokenRefs: baseTokenRefs.length > 0 ? baseTokenRefs : undefined,
    sourceLocation: scanned.sourceLocation,
  };
}

function resolveModule(
  scannedModule: ScannedModule,
  _warnings: string[],
): IRModule {
  const imports: ClassTokenRef[] = scannedModule.imports.map((imp) => ({
    kind: 'class' as const,
    className: imp.className,
    importPath: imp.sourceFile?.getFilePath() ?? '',
  }));

  // Two-pass provides resolution:
  // Pass 1: resolve return types to get each method's tokenRef + return type name
  const providesWithTokens = scannedModule.provides.map((p) => ({
    scanned: p,
    tokenRef: resolveProvidesReturnType(
      p.returnTypeName,
      p.returnTypeSourceFile,
      p.returnTypeArguments,
      p.returnResolvedBaseTypeName,
      p.methodName,
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

  // Pass 2: resolve params, wiring primitive params to matching provides
  const provides: IRProvides[] = providesWithTokens.map(
    ({ scanned: p, tokenRef }) => {
      const dependencies = resolveProvidesParams(
        p.params,
        `${scannedModule.classTokenRef.className}.${p.methodName}`,
        providesByReturnType,
      );

      return {
        methodName: p.methodName,
        tokenRef,
        scope: 'singleton' as const,
        eager: false,
        dependencies,
        sourceLocation: p.sourceLocation,
      };
    },
  );

  return {
    classTokenRef: scannedModule.classTokenRef,
    imports,
    provides,
    sourceLocation: scannedModule.sourceLocation,
  };
}

/**
 * Resolve @Provides method parameters, with special handling for primitives.
 * Primitive-typed params are matched to other @Provides methods that return that type.
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
        `parameter "${param.paramName}" of ${ownerName}`,
        param.sourceLocation,
      );
    }

    // Primitive param → look up matching @Provides by return type
    if (isPrimitiveType(param.typeName)) {
      const candidates = providesByReturnType.get(param.typeName);

      if (!candidates || candidates.length === 0) {
        throw new UnresolvableTypeError(
          `${param.typeName} (parameter "${param.paramName}" of ${ownerName})`,
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

  // If there's a source file for the type, it's a class
  if (typeSourceFile) {
    return {
      kind: 'class',
      className: resolvedBaseTypeName ?? typeName,
      importPath: typeSourceFile.getFilePath(),
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
      `parameter "${param.paramName}" of ${ownerName}`,
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
      `${param.typeName} (parameter "${param.paramName}" of ${ownerName})`,
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
    throw new UnresolvableTypeError(
      `field "${field.fieldName}" of ${ownerName}`,
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
