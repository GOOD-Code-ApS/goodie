import type { SourceLocation } from './ir.js';

function formatLocation(loc: SourceLocation): string {
  return `${loc.filePath}:${loc.line}:${loc.column}`;
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
  ) {
    super(
      `No provider found for "${tokenDescription}" (required by ${requiredBy})`,
      sourceLocation,
      'Ensure the dependency is decorated with @Injectable(), @Singleton(), or provided by a @Module.',
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
  ) {
    super(
      `Ambiguous provider for "${tokenDescription}": found ${candidates.join(', ')}`,
      sourceLocation,
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
