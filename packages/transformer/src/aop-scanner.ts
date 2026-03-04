import { type Project, SyntaxKind, type Type } from 'ts-morph';

/** Result of scanning a single `createAopDecorator<{...}>()` call. */
export interface ScannedAopDecorator {
  /** Variable name (e.g. "Log", "Cacheable"). */
  decoratorName: string;
  /** Resolved interceptor class name (e.g. "LoggingInterceptor"). */
  interceptorClassName: string;
  /** Absolute source file path of the interceptor class. */
  interceptorImportPath: string;
  /** Chain order — lower = outermost. */
  order: number;
  /** Static metadata (e.g. `{ cacheAction: 'get' }`). */
  metadata?: Record<string, unknown>;
  /** Maps positional decorator args to named keys. */
  argMapping?: string[];
  /** Default values when decorator args are missing. */
  defaults?: Record<string, unknown>;
}

/**
 * Scan a ts-morph Project for `createAopDecorator<{...}>()` calls.
 *
 * Extracts AOP config from the **type parameter** using the TypeScript type
 * checker — no AST value parsing needed.
 */
export function scanAopDecoratorDefinitions(
  project: Project,
): ScannedAopDecorator[] {
  const results: ScannedAopDecorator[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const initializer = varDecl.getInitializerIfKind(
        SyntaxKind.CallExpression,
      );
      if (!initializer) continue;

      // Check if callee is `createAopDecorator`
      const expr = initializer.getExpression();
      if (expr.getText() !== 'createAopDecorator') continue;

      // Get the first type argument node
      const typeArgs = initializer.getTypeArguments();
      if (typeArgs.length === 0) continue;

      const configType = typeArgs[0].getType();
      const scanned = extractConfigFromType(configType);
      if (!scanned) continue;

      results.push({
        decoratorName: varDecl.getName(),
        ...scanned,
      });
    }
  }

  return results;
}

/**
 * Extract AOP config from a resolved Type.
 * Returns null if required fields (interceptor, order) are missing or unresolvable.
 */
function extractConfigFromType(
  configType: Type,
): Omit<ScannedAopDecorator, 'decoratorName'> | null {
  // --- interceptor (required) ---
  const interceptorProp = configType.getProperty('interceptor');
  if (!interceptorProp) return null;

  const interceptorType = interceptorProp
    .getValueDeclarationOrThrow()
    .getType();
  const interceptorSymbol = interceptorType.getSymbol();
  if (!interceptorSymbol) return null;

  const interceptorDecl = interceptorSymbol.getDeclarations()[0];
  if (!interceptorDecl) return null;

  const interceptorClassName = interceptorSymbol.getName();
  const interceptorImportPath = interceptorDecl.getSourceFile().getFilePath();

  // --- order (required) ---
  const orderProp = configType.getProperty('order');
  if (!orderProp) return null;

  const orderType = orderProp.getValueDeclarationOrThrow().getType();
  if (!orderType.isNumberLiteral()) {
    console.warn(
      `[@goodie-ts] AOP decorator config: 'order' must be a literal number type (e.g. -100), got '${orderType.getText()}'`,
    );
    return null;
  }
  const order = orderType.getLiteralValue() as number;

  // --- metadata (optional) ---
  const metadataProp = configType.getProperty('metadata');
  const metadata = metadataProp
    ? extractObjectFromType(metadataProp.getValueDeclarationOrThrow().getType())
    : undefined;

  // --- argMapping (optional) ---
  const argMappingProp = configType.getProperty('argMapping');
  const argMapping = argMappingProp
    ? extractStringTupleFromType(
        argMappingProp.getValueDeclarationOrThrow().getType(),
      )
    : undefined;

  // --- defaults (optional) ---
  const defaultsProp = configType.getProperty('defaults');
  const defaults = defaultsProp
    ? extractObjectFromType(defaultsProp.getValueDeclarationOrThrow().getType())
    : undefined;

  return {
    interceptorClassName,
    interceptorImportPath,
    order,
    metadata,
    argMapping,
    defaults,
  };
}

/**
 * Extract a plain object from a TypeScript object literal type.
 * Handles string, number, and boolean literal properties.
 */
function extractObjectFromType(type: Type): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of type.getProperties()) {
    const propType = prop.getValueDeclarationOrThrow().getType();
    const value = extractLiteralValue(propType);
    if (value !== undefined) {
      result[prop.getName()] = value;
    }
  }

  return result;
}

/**
 * Extract a string[] from a TypeScript tuple type (e.g. `['cacheName']`).
 */
function extractStringTupleFromType(type: Type): string[] {
  if (!type.isTuple()) return [];

  return type.getTupleElements().flatMap((elem) => {
    if (elem.isStringLiteral()) {
      return [elem.getLiteralValue() as string];
    }
    return [];
  });
}

/**
 * Extract a literal value from a TypeScript literal type.
 * Returns undefined for non-literal types.
 */
function extractLiteralValue(type: Type): unknown {
  if (type.isStringLiteral()) return type.getLiteralValue();
  if (type.isNumberLiteral()) return type.getLiteralValue();
  if (type.isBooleanLiteral()) return type.getText() === 'true';
  return undefined;
}
