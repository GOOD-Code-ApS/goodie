import type { IRComponentDefinition } from './ir.js';
import type { MethodVisitorContext, TransformerPlugin } from './options.js';

/** Declaration for a single AOP decorator in `goodie.aop`. */
export interface AopDecoratorDeclaration {
  /** Interceptor class name (e.g. "LoggingInterceptor"). */
  interceptor: string;
  /** Chain order — lower = outermost. */
  order: number;
  /** Static metadata merged into every interceptor ref (e.g. `{ cacheAction: 'get' }`). */
  metadata?: Record<string, unknown>;
  /** Maps positional decorator args to key names (e.g. `['cacheName']`). */
  argMapping?: string[];
  /** Default values when args are missing. */
  defaults?: Record<string, unknown>;
}

/** A resolved AOP mapping ready for use by the generic plugin. */
export interface ResolvedAopMapping {
  /** Decorator name as it appears in source code (e.g. "Log", "Cacheable"). */
  decoratorName: string;
  /** The declaration from package.json. */
  declaration: AopDecoratorDeclaration;
  /** npm package name — used as importPath for the interceptor. */
  packageName: string;
}

/** Internal tracking of scanned decorator usages. */
interface ScannedMethodInfo {
  methodName: string;
  interceptorClassName: string;
  importPath: string;
  order: number;
  metadata: Record<string, unknown>;
}

/**
 * Parse a literal value from AST text.
 * Handles strings, numbers, booleans, and `undefined`/`null`.
 */
function parseLiteral(text: string): unknown {
  const trimmed = text.trim();

  // String literals: 'foo' or "foo"
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // null / undefined
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;

  // Numeric literals (support TypeScript numeric separators like 1_000)
  const stripped = trimmed.replace(/_/g, '');
  const num = Number(stripped);
  if (!Number.isNaN(num) && stripped.length > 0) return num;

  // Unrecognized — return as-is (probably a const reference, will be ignored)
  return undefined;
}

/**
 * Parse an object literal text into key-value pairs.
 * Handles `{ key: value, key2: value2 }` where values are literals.
 */
function parseObjectLiteral(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Match key: value pairs — supports strings, numbers, booleans
  const pairRegex =
    /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d[\d_.]*(?:\.[\d_]+)?)|true|false)/g;

  for (
    let match = pairRegex.exec(text);
    match !== null;
    match = pairRegex.exec(text)
  ) {
    const key = match[1];
    const fullMatch = match[0];

    // Extract value from the full match
    const colonIdx = fullMatch.indexOf(':');
    const valueText = fullMatch.slice(colonIdx + 1).trim();
    const parsed = parseLiteral(valueText);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }

  return result;
}

/**
 * Generic decorator argument parser.
 *
 * Patterns:
 * - No args → `{}`
 * - Object literal (starts with `{`) → parse key:value pairs
 * - Positional args → use `argMapping` for key names
 * - Positional + trailing object → merge both
 */
function parseDecoratorArgs(
  argTexts: string[],
  declaration: AopDecoratorDeclaration,
): Record<string, unknown> {
  const { argMapping, defaults, metadata: staticMetadata } = declaration;

  if (argTexts.length === 0) {
    // No args — merge defaults with static metadata
    return { ...(defaults ?? {}), ...(staticMetadata ?? {}) };
  }

  const parsed: Record<string, unknown> = {};

  // Process positional args using argMapping
  if (argMapping && argMapping.length > 0) {
    for (let i = 0; i < argMapping.length && i < argTexts.length; i++) {
      const text = argTexts[i].trim();

      // If this positional arg is an object literal, parse it as named args
      if (text.startsWith('{')) {
        const objParsed = parseObjectLiteral(text);
        Object.assign(parsed, objParsed);
      } else {
        const value = parseLiteral(text);
        if (value !== undefined) {
          parsed[argMapping[i]] = value;
        }
      }
    }

    // Process remaining args after argMapping as object literals
    for (let i = argMapping.length; i < argTexts.length; i++) {
      const text = argTexts[i].trim();
      if (text.startsWith('{')) {
        const objParsed = parseObjectLiteral(text);
        Object.assign(parsed, objParsed);
      }
    }
  } else {
    // No argMapping — first arg is expected to be an object literal
    const text = argTexts[0].trim();
    if (text.startsWith('{')) {
      Object.assign(parsed, parseObjectLiteral(text));
    } else {
      // Single positional value with no mapping — try to parse as literal
      // This handles cases like @Timeout(3000) when no argMapping is defined
      // but defaults are present — merge parsed value as first default key
      const value = parseLiteral(text);
      if (value !== undefined && defaults) {
        const firstKey = Object.keys(defaults)[0];
        if (firstKey) {
          parsed[firstKey] = value;
        }
      }
    }

    // Process additional args as object literals
    for (let i = 1; i < argTexts.length; i++) {
      const text = argTexts[i].trim();
      if (text.startsWith('{')) {
        Object.assign(parsed, parseObjectLiteral(text));
      }
    }
  }

  // Merge order: defaults ← parsed ← static metadata
  return { ...(defaults ?? {}), ...parsed, ...(staticMetadata ?? {}) };
}

/**
 * Create a declarative AOP transformer plugin from resolved mappings.
 *
 * Replaces hand-written per-package plugins (logging, cache, resilience)
 * with a single generic plugin driven by `goodie.aop` declarations.
 */
export function createDeclarativeAopPlugin(
  mappings: ResolvedAopMapping[],
): TransformerPlugin {
  // Build lookup: decoratorName → mapping
  const decoratorLookup = new Map<string, ResolvedAopMapping>();
  for (const mapping of mappings) {
    decoratorLookup.set(mapping.decoratorName, mapping);
  }

  // State: accumulated per-class method info
  let classMethodInfo = new Map<string, ScannedMethodInfo[]>();

  return {
    name: 'declarative-aop',

    beforeScan(): void {
      classMethodInfo = new Map();
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        const decoratorName = decorator.getName();
        const mapping = decoratorLookup.get(decoratorName);
        if (!mapping) continue;

        const argTexts = decorator.getArguments().map((a) => a.getText());
        const metadata = parseDecoratorArgs(argTexts, mapping.declaration);

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classMethodInfo.get(key) ?? [];
        existing.push({
          methodName: ctx.methodName,
          interceptorClassName: mapping.declaration.interceptor,
          importPath: mapping.packageName,
          order: mapping.declaration.order,
          metadata,
        });
        classMethodInfo.set(key, existing);
      }
    },

    afterResolve(components: IRComponentDefinition[]): IRComponentDefinition[] {
      for (const component of components) {
        const className =
          component.tokenRef.kind === 'class'
            ? component.tokenRef.className
            : undefined;
        if (!className) continue;

        const key = `${component.tokenRef.importPath}:${className}`;
        const infos = classMethodInfo.get(key);
        if (!infos || infos.length === 0) continue;

        // Get or initialize interceptedMethods array
        const existing = (component.metadata.interceptedMethods ??
          []) as Array<{
          methodName: string;
          interceptors: Array<{
            className: string;
            importPath: string;
            adviceType: string;
            order: number;
            metadata?: Record<string, unknown>;
          }>;
        }>;

        for (const info of infos) {
          const methodEntry = existing.find(
            (m) => m.methodName === info.methodName,
          );

          const interceptorRef = {
            className: info.interceptorClassName,
            importPath: info.importPath,
            adviceType: 'around' as const,
            order: info.order,
            metadata: info.metadata,
          };

          if (methodEntry) {
            methodEntry.interceptors.push(interceptorRef);
          } else {
            existing.push({
              methodName: info.methodName,
              interceptors: [interceptorRef],
            });
          }
        }

        component.metadata.interceptedMethods = existing;
      }

      // No synthetic components — library components.json already contains them
      return components;
    },
  };
}

// Export parseDecoratorArgs for testing
export { parseDecoratorArgs as _parseDecoratorArgs };
