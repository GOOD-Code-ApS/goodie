import {
  type ClassDeclaration,
  type Decorator,
  type Node,
  SyntaxKind,
  type Type,
} from 'ts-morph';
import type { IRComponentDefinition } from './ir.js';
import type {
  ClassVisitorContext,
  CodegenContext,
  CodegenContribution,
  TransformerPlugin,
} from './options.js';

// ── Scanned introspection data (intermediate representation) ──

interface ScannedIntrospectedClass {
  className: string;
  importPath: string;
  fields: ScannedIntrospectedField[];
}

interface ScannedDecoratorMeta {
  name: string;
  args: Record<string, unknown>;
}

interface ScannedIntrospectedField {
  name: string;
  type: ScannedFieldType;
  decorators: ScannedDecoratorMeta[];
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
  const introspectedClasses: ScannedIntrospectedClass[] = [];

  return {
    name: 'introspection',

    visitClass(ctx: ClassVisitorContext): void {
      const isIntrospected = ctx.decorators.some(
        (d) => d.name === 'Introspected',
      );
      if (!isIntrospected) return;

      const cls = ctx.classDeclaration;
      const fields = scanClassFields(cls);

      introspectedClasses.push({
        className: ctx.className,
        importPath: ctx.filePath,
        fields,
      });
    },

    codegen(
      _beans: IRComponentDefinition[],
      _context?: CodegenContext,
    ): CodegenContribution {
      if (introspectedClasses.length === 0) {
        return {};
      }

      const imports: string[] = [
        "import { MetadataRegistry } from '@goodie-ts/core'",
      ];
      const code: string[] = [];

      // Import all introspected classes
      for (const cls of introspectedClasses) {
        imports.push(`import { ${cls.className} } from '${cls.importPath}'`);
      }

      // Populate the static singleton registry
      code.push('// Metadata registry population');

      for (const cls of introspectedClasses) {
        const fieldsJson = JSON.stringify(
          cls.fields.map((f) => ({
            name: f.name,
            type: serializeFieldType(f.type),
            decorators: f.decorators,
          })),
        );

        code.push(
          `MetadataRegistry.INSTANCE.register({ type: ${cls.className}, className: '${cls.className}', fields: ${fieldsJson} })`,
        );
      }

      return { imports, code };
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

    // Skip private/protected
    const scope = prop.getScope();
    if (scope === 'private' || scope === 'protected') continue;

    // Resolve type
    const propType = prop.getType();
    const fieldType = resolveFieldType(propType);

    // Extract all field decorators generically
    const decorators = extractFieldDecorators(prop.getDecorators());

    fields.push({ name, type: fieldType, decorators });
  }

  return fields;
}

function extractFieldDecorators(
  decorators: Decorator[],
): ScannedDecoratorMeta[] {
  const result: ScannedDecoratorMeta[] = [];

  for (const dec of decorators) {
    const name = dec.getName();
    if (IGNORED_DECORATORS.has(name)) continue;

    const callExpr = dec.getCallExpression();
    const astArgs = callExpr ? callExpr.getArguments() : [];

    const args = parseDecoratorArgs(astArgs);

    result.push({ name, args });
  }

  return result;
}

function parseDecoratorArgs(args: Node[]): Record<string, unknown> {
  if (args.length === 0) return {};

  // Single object literal argument → parse its properties via AST
  if (
    args.length === 1 &&
    args[0].getKind() === SyntaxKind.ObjectLiteralExpression
  ) {
    return parseObjectLiteralNode(args[0]);
  }

  // Single positional argument → { value: <parsed> }
  if (args.length === 1) {
    return { value: parseNodeValue(args[0]) };
  }

  // Multiple positional args → { value: first, value2: second, ... }
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    result[i === 0 ? 'value' : `value${i + 1}`] = parseNodeValue(args[i]);
  }
  return result;
}

function parseNodeValue(node: Node): unknown {
  const kind = node.getKind();

  // String literal
  if (kind === SyntaxKind.StringLiteral) {
    const text = node.getText();
    return text.slice(1, -1);
  }

  // Numeric literal
  if (kind === SyntaxKind.NumericLiteral) {
    return Number(node.getText());
  }

  // Negative number: PrefixUnaryExpression with minus + NumericLiteral
  if (kind === SyntaxKind.PrefixUnaryExpression) {
    const text = node.getText();
    const num = Number(text);
    if (!Number.isNaN(num)) return num;
  }

  // Boolean literals
  if (kind === SyntaxKind.TrueKeyword) return true;
  if (kind === SyntaxKind.FalseKeyword) return false;

  // Array literal
  if (kind === SyntaxKind.ArrayLiteralExpression) {
    const arrayExpr = node.asKind(SyntaxKind.ArrayLiteralExpression)!;
    return arrayExpr.getElements().map((el) => parseNodeValue(el));
  }

  // Object literal (nested)
  if (kind === SyntaxKind.ObjectLiteralExpression) {
    return parseObjectLiteralNode(node);
  }

  // Fallback: raw text
  return node.getText();
}

function parseObjectLiteralNode(node: Node): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of node.getChildrenOfKind(SyntaxKind.PropertyAssignment)) {
    const key = prop.getChildAtIndex(0).getText();
    const initializer = prop.getInitializer();
    if (initializer) {
      result[key] = parseNodeValue(initializer);
    }
  }

  return result;
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
