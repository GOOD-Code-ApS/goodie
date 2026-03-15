/**
 * Marks a component as the default (primary) when multiple components match a dependency type.
 *
 * When multiple components are registered under the same token, the container selects
 * the `@Primary` component for injection unless the injection point specifies a qualifier
 * (e.g. `@Inject('name')`).
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Primary
 * @Singleton()
 * class InMemoryCache implements CacheProvider { ... }
 *
 * @Named('redis')
 * @Singleton()
 * class RedisCache implements CacheProvider { ... }
 */
export function Primary(
  _target: new (...args: any[]) => any,
  _context: ClassDecoratorContext,
): void {}
