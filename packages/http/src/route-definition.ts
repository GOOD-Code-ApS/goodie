import type { RouteEntry } from './router-builder.js';
import { RouterBuilder } from './router-builder.js';

/**
 * A collection of route entries produced by `defineRoutes()` or converted from `@Controller` metadata.
 *
 * Registered as a bean with `baseTokens: [RouteDefinition]` so the Router can
 * discover all route definitions via `ctx.getAll(RouteDefinition)`.
 */
export class RouteDefinition {
  constructor(readonly routes: readonly RouteEntry[]) {}

  /**
   * Build a RouteDefinition by populating a RouterBuilder.
   * Useful in tests or manual wiring without the transformer.
   */
  static build(fn: (router: RouterBuilder) => void): RouteDefinition {
    const builder = new RouterBuilder();
    fn(builder);
    return new RouteDefinition(builder.getEntries());
  }
}
