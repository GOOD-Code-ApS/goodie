import type { ClassDeclaration, Type } from 'ts-morph';
import { extractDecoratorMeta } from './decorator-utils.js';
import type { ClassVisitorContext, TransformerPlugin } from './options.js';

// ── Scanned introspection data (intermediate representation) ──

import type { ParsedDecoratorMeta } from './decorator-utils.js';

interface ScannedIntrospectedField {
  name: string;
  type: ScannedFieldType;
  decorators: ParsedDecoratorMeta[];
}

type ScannedFieldType =
  | { kind: 'primitive'; type: string }
  | { kind: 'literal'; value: string }
  | { kind: 'array'; elementType: ScannedFieldType }
  | { kind: 'reference'; className: string; importPath: string }
  | { kind: 'union'; types: ScannedFieldType[] }
  | { kind: 'optional'; inner: ScannedFieldType }
  | { kind: 'nullable'; inner: ScannedFieldType };

/**
 * Built-in introspection transformer plugin.
 *
 * Scans `@Introspected()` decorated classes for field type metadata and
 * generates `MetadataRegistry` registration code. Introspected classes
 * are NOT beans — they are value objects (DTOs, request/response types)
 * whose shape metadata is consumed at runtime by validation, OpenAPI, etc.
 *
 * Constraint extraction (e.g. `@MinLength`, `@Email`) is NOT handled here —
 * that belongs to the validation package's plugin (#105).
 */
export function createIntrospectionPlugin(): TransformerPlugin {
  return {
    name: 'introspection',

    visitClass(ctx: ClassVisitorContext): void {
      const isIntrospected = ctx.decorators.some(
        (d) => d.name === 'Introspected' || d.name === 'Config',
      );
      if (!isIntrospected) return;

      const cls = ctx.classDeclaration;
      const fields = scanClassFields(cls);

      // Store raw fields so other plugins (e.g. config) can consume it
      ctx.metadata.introspectedFields = fields;

      // Store pre-serialized registration data for core codegen
      ctx.metadata.__typeRegistration = {
        className: ctx.className,
        importPath: ctx.filePath,
        fields: fields.map((f) => ({
          name: f.name,
          type: serializeFieldType(f.type),
          decorators: f.decorators,
        })),
      };
    },
  };
}

// ── Field scanning ──

/** Decorators that are part of TypeScript/DI plumbing, not meaningful metadata. */
const IGNORED_DECORATORS = new Set(['Introspected']);

function scanClassFields(cls: ClassDeclaration): ScannedIntrospectedField[] {
  const fields: ScannedIntrospectedField[] = [];

  for (const prop of cls.getProperties()) {
    const name = String(prop.getName());

    // Skip private/protected (by TypeScript modifier or underscore convention)
    const scope = prop.getScope();
    if (scope === 'private' || scope === 'protected') continue;
    if (name.startsWith('_')) continue;

    // Resolve type
    const propType = prop.getType();
    const fieldType = resolveFieldType(propType);

    // Extract all field decorators generically
    const decorators = extractDecoratorMeta(
      prop.getDecorators(),
      IGNORED_DECORATORS,
    );

    fields.push({ name, type: fieldType, decorators });
  }

  return fields;
}

// ── Type resolution ──

function resolveFieldType(type: Type): ScannedFieldType {
  // Handle union types first (includes T | undefined, T | null)
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();

    // Check for optional (T | undefined)
    const undefinedIdx = unionTypes.findIndex((t) => t.isUndefined());
    if (undefinedIdx !== -1) {
      const remaining = unionTypes.filter((_, i) => i !== undefinedIdx);

      // Also strip null → optional + nullable (e.g. string | null | undefined)
      const nullIdx = remaining.findIndex((t) => t.isNull());
      if (nullIdx !== -1) {
        const innerRemaining = remaining.filter((_, i) => i !== nullIdx);
        const innerType =
          innerRemaining.length === 1
            ? resolveFieldType(innerRemaining[0])
            : {
                kind: 'union' as const,
                types: innerRemaining.map(resolveFieldType),
              };
        return {
          kind: 'optional',
          inner: { kind: 'nullable', inner: innerType },
        };
      }

      const inner =
        remaining.length === 1
          ? resolveFieldType(remaining[0])
          : { kind: 'union' as const, types: remaining.map(resolveFieldType) };
      return { kind: 'optional', inner };
    }

    // Check for nullable (T | null)
    const nullIdx = unionTypes.findIndex((t) => t.isNull());
    if (nullIdx !== -1) {
      const remaining = unionTypes.filter((_, i) => i !== nullIdx);
      const inner =
        remaining.length === 1
          ? resolveFieldType(remaining[0])
          : { kind: 'union' as const, types: remaining.map(resolveFieldType) };
      return { kind: 'nullable', inner };
    }

    // Check for boolean (ts-morph represents boolean as false | true union)
    if (
      unionTypes.length === 2 &&
      unionTypes.every((t) => t.isBooleanLiteral())
    ) {
      return { kind: 'primitive', type: 'boolean' };
    }

    // Check for literal union (e.g. 'active' | 'inactive')
    if (
      unionTypes.every(
        (t) =>
          t.isStringLiteral() || t.isNumberLiteral() || t.isBooleanLiteral(),
      )
    ) {
      return {
        kind: 'union',
        types: unionTypes.map((t) => ({
          kind: 'literal' as const,
          value: t.getText(),
        })),
      };
    }

    // General union
    return {
      kind: 'union',
      types: unionTypes.map(resolveFieldType),
    };
  }

  // Array types
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return { kind: 'array', elementType: resolveFieldType(elementType) };
  }

  // String literals
  if (type.isStringLiteral()) {
    return { kind: 'literal', value: type.getText() };
  }

  // Number literals
  if (type.isNumberLiteral()) {
    return { kind: 'literal', value: type.getText() };
  }

  // Boolean literals
  if (type.isBooleanLiteral()) {
    return { kind: 'literal', value: type.getText() };
  }

  // Primitives
  if (type.isString()) return { kind: 'primitive', type: 'string' };
  if (type.isNumber()) return { kind: 'primitive', type: 'number' };
  if (type.isBoolean()) return { kind: 'primitive', type: 'boolean' };

  // Class/interface references
  const symbol = type.getSymbol();
  if (symbol) {
    const declarations = symbol.getDeclarations();
    if (declarations.length > 0) {
      const decl = declarations[0];
      const sourceFile = decl.getSourceFile();
      return {
        kind: 'reference',
        className: symbol.getName(),
        importPath: sourceFile.getFilePath(),
      };
    }
    return { kind: 'reference', className: symbol.getName(), importPath: '' };
  }

  // Fallback: treat as primitive with the type text
  return { kind: 'primitive', type: type.getText() };
}

// ── Serialization helpers ──

/** Serialize ScannedFieldType to the runtime FieldType shape (strip importPath from references). */
function serializeFieldType(type: ScannedFieldType): Record<string, unknown> {
  switch (type.kind) {
    case 'primitive':
      return { kind: 'primitive', type: type.type };
    case 'literal':
      return { kind: 'literal', value: type.value };
    case 'array':
      return {
        kind: 'array',
        elementType: serializeFieldType(type.elementType),
      };
    case 'reference':
      return { kind: 'reference', className: type.className };
    case 'union':
      return { kind: 'union', types: type.types.map(serializeFieldType) };
    case 'optional':
      return { kind: 'optional', inner: serializeFieldType(type.inner) };
    case 'nullable':
      return { kind: 'nullable', inner: serializeFieldType(type.inner) };
  }
}
