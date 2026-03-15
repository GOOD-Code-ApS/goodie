import type { SourceLocation } from './ir.js';

function formatLocation(loc: SourceLocation): string {
  return `${loc.filePath}:${loc.line}:${loc.column}`;
}

/**
 * Find similar token names using Levenshtein distance.
 * Returns up to 3 suggestions within a threshold of max(3, ceil(name.length / 2)).
 *
 * NOTE: levenshtein/findSimilar are duplicated in packages/core/src/application-context.ts
 * (separate packages, no shared util). Keep threshold logic in sync.
 */
export function findSimilarTokens(
  name: string,
  candidates: string[],
  maxResults = 3,
): string[] {
  const threshold = Math.max(3, Math.ceil(name.length / 2));
  const scored = candidates
    .map((c) => ({
      name: c,
      dist: levenshtein(name.toLowerCase(), c.toLowerCase()),
    }))
    .filter((s) => s.dist <= threshold && s.dist > 0)
    .sort((a, b) => a.dist - b.dist);
  return scored.slice(0, maxResults).map((s) => s.name);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Base error for all compile-time transformer failures. */
export class TransformerError extends Error {
  constructor(
    message: string,
    readonly sourceLocation: SourceLocation,
    readonly hint: string | undefined,
  ) {
    const parts = [message, '', `  ${formatLocation(sourceLocation)}`];
    if (hint) {
      parts.push('', `  ${hint}`);
    }
    super(parts.join('\n'));
    this.name = 'TransformerError';
  }
}

/** A required dependency has no registered provider. */
export class MissingProviderError extends TransformerError {
  constructor(
    readonly tokenDescription: string,
    readonly requiredBy: string,
    sourceLocation: SourceLocation,
    customHint?: string,
  ) {
    super(
      `No provider found for "${tokenDescription}" (required by ${requiredBy})`,
      sourceLocation,
      customHint ??
        'Ensure the dependency is decorated with @Transient(), @Singleton(), or provided by a @Factory.',
    );
    this.name = 'MissingProviderError';
  }
}

/** Multiple providers match a dependency and no qualifier disambiguates. */
export class AmbiguousProviderError extends TransformerError {
  constructor(
    readonly tokenDescription: string,
    readonly candidates: string[],
    sourceLocation: SourceLocation,
    customHint?: string,
  ) {
    super(
      `Ambiguous provider for "${tokenDescription}": found ${candidates.join(', ')}`,
      sourceLocation,
      customHint ??
        'Use @Named() on the providers and @Inject(name) on the injection point to disambiguate.',
    );
    this.name = 'AmbiguousProviderError';
  }
}

/** A constructor parameter or field type cannot be resolved at compile time. */
export class UnresolvableTypeError extends TransformerError {
  constructor(
    readonly typeDescription: string,
    sourceLocation: SourceLocation,
  ) {
    super(
      `Cannot resolve type "${typeDescription}" at compile time`,
      sourceLocation,
      'Use a concrete class type, or use @Inject(token) on an accessor field for interfaces/primitives.',
    );
    this.name = 'UnresolvableTypeError';
  }
}

/** A decorator is used in an unsupported position or combination. */
export class InvalidDecoratorUsageError extends TransformerError {
  constructor(
    readonly decoratorName: string,
    readonly reason: string,
    sourceLocation: SourceLocation,
  ) {
    super(
      `Invalid usage of @${decoratorName}: ${reason}`,
      sourceLocation,
      undefined,
    );
    this.name = 'InvalidDecoratorUsageError';
  }
}

/** A generic type could not be resolved to a canonical form. */
export class GenericTypeResolutionError extends TransformerError {
  constructor(
    readonly typeName: string,
    readonly reason: string,
    sourceLocation: SourceLocation,
  ) {
    super(
      `Cannot resolve generic type "${typeName}": ${reason}`,
      sourceLocation,
      'Ensure the generic type has concrete type arguments and the base class is importable.',
    );
    this.name = 'GenericTypeResolutionError';
  }
}

/** Circular dependency detected at compile time with full cycle path. */
export class CircularDependencyError extends TransformerError {
  constructor(
    readonly cyclePath: string[],
    sourceLocation: SourceLocation,
  ) {
    super(
      `Circular dependency detected: ${cyclePath.join(' → ')}`,
      sourceLocation,
      'Break the cycle by using @Optional() on an accessor field or restructuring your dependencies.',
    );
    this.name = 'CircularDependencyError';
  }
}
