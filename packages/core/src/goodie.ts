import { ApplicationContext } from './application-context.js';
import type { ComponentDefinition } from './component-definition.js';
import { OnStart } from './on-start.js';

/**
 * Fluent builder for bootstrapping an ApplicationContext.
 *
 * Obtained via `Goodie.build(definitions)`. Call `.start()` to create
 * and initialize the context. After context creation, discovers all
 * `OnStart` components (sorted by `@Order()`) and executes them.
 *
 * Usage:
 * ```ts
 * import { app } from './__generated__/context.js'
 * await app.start()
 * ```
 */
export class GoodieBuilder {
  constructor(private readonly definitions: ComponentDefinition[]) {}

  /** Build and start the ApplicationContext, then run all OnStart components. */
  async start(): Promise<ApplicationContext> {
    const ctx = await ApplicationContext.create(this.definitions);
    try {
      // Discover OnStart components via baseTokens (sorted by @Order() via getAll)
      const onStartComponents = ctx.getAll(OnStart);
      for (const component of onStartComponents) {
        await component.onStart(ctx);
      }
    } catch (err) {
      await ctx.close().catch(() => {});
      throw err;
    }
    return ctx;
  }
}

/**
 * Entry point for the Goodie framework.
 *
 * Usage (in generated code):
 * ```ts
 * export const app = Goodie.build(definitions)
 * const ctx = await app.start()
 * ```
 */
export class Goodie {
  private constructor() {}

  /** Create a builder pre-loaded with the given component definitions. */
  static build(definitions: ComponentDefinition[]): GoodieBuilder {
    return new GoodieBuilder(definitions);
  }
}
