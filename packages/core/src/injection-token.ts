/**
 * A typed token used to look up beans in the container.
 *
 * Use this for interfaces, primitives, or any type that doesn't have
 * a class constructor at runtime.
 *
 * @example
 * const DB_URL = new InjectionToken<string>('DB_URL')
 */
export class InjectionToken<T> {
  /** Phantom field to carry the type parameter through the type system. */
  declare readonly __type: T;

  constructor(readonly description: string) {}

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}
