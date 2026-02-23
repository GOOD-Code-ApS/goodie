import type { InjectionToken } from './injection-token.js';
import type { Constructor, Scope } from './types.js';

/** A single dependency of a bean. */
export interface Dependency {
  /** The token to resolve. */
  token: InjectionToken<unknown> | Constructor;
  /** If true, resolves to `undefined` when no provider is registered. */
  optional: boolean;
}

/** Full metadata describing how to create and manage a bean. */
export interface BeanDefinition<T = unknown> {
  /** The token this bean is registered under. */
  token: InjectionToken<T> | Constructor<T>;
  /** Singleton (cached) or prototype (new instance per get). */
  scope: Scope;
  /** Ordered list of dependencies the factory expects. */
  dependencies: Dependency[];
  /** Creates the bean instance, receiving resolved dependencies in order. */
  factory: (...deps: unknown[]) => T | Promise<T>;
  /** Whether to instantiate eagerly during context creation. */
  eager: boolean;
  /** Arbitrary metadata stashed by decorators — extension libraries use this. */
  metadata: Record<string, unknown>;
}
