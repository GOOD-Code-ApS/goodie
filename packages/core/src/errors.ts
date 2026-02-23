/** Base error for all DI-related failures. */
export class DIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DIError';
  }
}

/** Thrown when a required dependency has no registered provider. */
export class MissingDependencyError extends DIError {
  constructor(
    readonly tokenDescription: string,
    readonly requiredBy?: string,
  ) {
    const msg = requiredBy
      ? `No provider registered for ${tokenDescription} (required by ${requiredBy})`
      : `No provider registered for ${tokenDescription}`;
    super(msg);
    this.name = 'MissingDependencyError';
  }
}

/** Thrown when a circular dependency is detected during topological sort. */
export class CircularDependencyError extends DIError {
  constructor(readonly cyclePath: string[]) {
    super(`Circular dependency detected: ${cyclePath.join(' → ')}`);
    this.name = 'CircularDependencyError';
  }
}

/** Thrown when `get()` is called for an async bean that hasn't been resolved yet. */
export class AsyncBeanNotReadyError extends DIError {
  constructor(readonly tokenDescription: string) {
    super(
      `Bean ${tokenDescription} is async and has not been resolved yet. Use getAsync() instead.`,
    );
    this.name = 'AsyncBeanNotReadyError';
  }
}

/** Thrown when trying to use a closed ApplicationContext. */
export class ContextClosedError extends DIError {
  constructor() {
    super('ApplicationContext has been closed');
    this.name = 'ContextClosedError';
  }
}

/** Thrown when overriding a bean whose token doesn't exist in the definitions. */
export class OverrideError extends DIError {
  constructor(readonly tokenDescription: string) {
    super(
      `Cannot override ${tokenDescription}: no bean with this token exists in the definitions`,
    );
    this.name = 'OverrideError';
  }
}
