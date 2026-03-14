import type { InjectionToken } from './injection-token.js';
import type { AbstractConstructor, Constructor, Scope } from './types.js';

/** A single dependency of a component. */
export interface Dependency {
  /** The token to resolve. */
  token: InjectionToken<unknown> | Constructor | AbstractConstructor;
  /** If true, resolves to `undefined` when no provider is registered. */
  optional: boolean;
  /** If true, inject all components under this token as an array via `getAll()`. */
  collection: boolean;
}

/** Full metadata describing how to create and manage a component. */
export interface ComponentDefinition<T = unknown> {
  /** The token this component is registered under. */
  token: InjectionToken<T> | Constructor<T>;
  /** Singleton (cached) or transient (new instance per get). */
  scope: Scope;
  /** Ordered list of dependencies the factory expects. */
  dependencies: Dependency[];
  /** Creates the component instance, receiving resolved dependencies in order. */
  factory: (...deps: unknown[]) => T | Promise<T>;
  /** Whether to instantiate eagerly during context creation. */
  eager: boolean;
  /** Additional tokens this component should be registered under (e.g. base classes). */
  baseTokens?: (InjectionToken<unknown> | Constructor | AbstractConstructor)[];
  /** Arbitrary metadata stashed by decorators — extension libraries use this. */
  metadata: Record<string, unknown>;
}
