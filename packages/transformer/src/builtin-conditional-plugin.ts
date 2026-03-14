import { SyntaxKind } from 'ts-morph';
import type { ClassVisitorContext, TransformerPlugin } from './options.js';

/** A single conditional rule extracted from a decorator. */
export interface ConditionalRule {
  type: 'onEnv' | 'onProperty' | 'onMissingBean';
  /** For onEnv: the environment variable name. */
  envVar?: string;
  /** For onEnv/onProperty: the expected value (undefined means "exists"). */
  expectedValue?: string;
  /** For onProperty: array of acceptable values (matched with OR logic). */
  expectedValues?: string[];
  /** For onProperty: the config key. */
  key?: string;
  /** For onMissingBean: the class name to check. */
  tokenClassName?: string;
  /** For onMissingBean: the import path of the class. */
  tokenImportPath?: string;
}

const CONDITIONAL_DECORATORS = [
  'ConditionalOnEnv',
  'ConditionalOnProperty',
  'ConditionalOnMissing',
] as const;

/**
 * Built-in conditional bean transformer plugin.
 *
 * Scans @ConditionalOnEnv, @ConditionalOnProperty, and @ConditionalOnMissing
 * decorators on classes. Stores the extracted rules in `metadata.conditionalRules`
 * so the graph builder can evaluate them and filter beans accordingly.
 */
export function createConditionalPlugin(): TransformerPlugin {
  return {
    name: 'conditional',

    visitClass(ctx: ClassVisitorContext): void {
      const decorators = ctx.classDeclaration.getDecorators();
      const rules: ConditionalRule[] = [];

      for (const decorator of decorators) {
        const name = decorator.getName();
        if (
          !CONDITIONAL_DECORATORS.includes(
            name as (typeof CONDITIONAL_DECORATORS)[number],
          )
        ) {
          continue;
        }

        const args = decorator.getArguments();

        if (name === 'ConditionalOnEnv') {
          if (args.length === 0) continue;
          const envVarText = args[0].getText();
          const envVar = stripStringLiteral(envVarText);
          const expectedValue =
            args.length > 1 ? stripStringLiteral(args[1].getText()) : undefined;
          rules.push({ type: 'onEnv', envVar, expectedValue });
        } else if (name === 'ConditionalOnProperty') {
          if (args.length === 0) continue;
          const keyText = args[0].getText();
          const key = stripStringLiteral(keyText);

          if (args.length > 1) {
            const secondArg = args[1];
            if (secondArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
              // { havingValue: 'x' } or { havingValue: ['x', 'y'] }
              const objLiteral = secondArg.asKindOrThrow(
                SyntaxKind.ObjectLiteralExpression,
              );
              const havingValueProp = objLiteral
                .getProperties()
                .find(
                  (p) =>
                    p.getKind() === SyntaxKind.PropertyAssignment &&
                    p.asKindOrThrow(SyntaxKind.PropertyAssignment).getName() ===
                      'havingValue',
                );
              if (havingValueProp) {
                const initializer = havingValueProp
                  .asKindOrThrow(SyntaxKind.PropertyAssignment)
                  .getInitializer();
                if (
                  initializer &&
                  initializer.getKind() === SyntaxKind.ArrayLiteralExpression
                ) {
                  const arr = initializer.asKindOrThrow(
                    SyntaxKind.ArrayLiteralExpression,
                  );
                  const values = arr
                    .getElements()
                    .map((e) => stripStringLiteral(e.getText()));
                  rules.push({
                    type: 'onProperty',
                    key,
                    expectedValues: values,
                  });
                } else if (initializer) {
                  rules.push({
                    type: 'onProperty',
                    key,
                    expectedValue: stripStringLiteral(initializer.getText()),
                  });
                }
              } else {
                rules.push({ type: 'onProperty', key });
              }
            } else {
              // Legacy positional string: @ConditionalOnProperty('key', 'value')
              rules.push({
                type: 'onProperty',
                key,
                expectedValue: stripStringLiteral(secondArg.getText()),
              });
            }
          } else {
            rules.push({ type: 'onProperty', key });
          }
        } else if (name === 'ConditionalOnMissing') {
          if (args.length === 0) continue;
          const tokenArg = args[0];
          let className = tokenArg.getText();
          let importPath = '';

          // Resolve the token class via ts-morph type system
          const tokenType = tokenArg.getType();
          const symbol = tokenType.getSymbol();
          if (symbol) {
            className = symbol.getName();
            const decls = symbol.getDeclarations();
            if (decls.length > 0) {
              importPath = decls[0].getSourceFile().getFilePath();
            }
          }

          if (!importPath) {
            console.warn(
              `[goodie] @ConditionalOnMissing(${className}): could not resolve import path for token class. ` +
                `The condition may not match correctly. Ensure the class is imported and resolvable.`,
            );
          }

          rules.push({
            type: 'onMissingBean',
            tokenClassName: className,
            tokenImportPath: importPath,
          });
        }
      }

      if (rules.length > 0) {
        ctx.metadata.conditionalRules = rules;
      }
    },
  };
}

/** Strip surrounding quotes from a string literal text. */
function stripStringLiteral(text: string): string {
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1);
  }
  return text;
}
