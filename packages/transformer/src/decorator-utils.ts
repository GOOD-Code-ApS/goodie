import { type Decorator, type Node, SyntaxKind } from 'ts-morph';

/** Parsed decorator metadata — name and arguments as key-value pairs. */
export interface ParsedDecoratorMeta {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Extract decorator metadata from an array of ts-morph Decorator nodes.
 * Skips decorators in the optional `ignore` set.
 */
export function extractDecoratorMeta(
  decorators: Decorator[],
  ignore?: Set<string>,
): ParsedDecoratorMeta[] {
  const result: ParsedDecoratorMeta[] = [];

  for (const dec of decorators) {
    const name = dec.getName();
    if (ignore?.has(name)) continue;

    const callExpr = dec.getCallExpression();
    const astArgs = callExpr ? callExpr.getArguments() : [];

    const args = parseDecoratorArgs(astArgs);

    result.push({ name, args });
  }

  return result;
}

export function parseDecoratorArgs(args: Node[]): Record<string, unknown> {
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

export function parseNodeValue(node: Node): unknown {
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
