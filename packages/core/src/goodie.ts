import { ApplicationContext } from './application-context.js';
import type { ComponentDefinition } from './component-definition.js';

/**
 * Fluent builder for bootstrapping an ApplicationContext.
 *
 * Obtained via `Goodie.build(definitions)`. Call `.start()` to create
 * and initialize the context. Plugins (e.g. hono) register `onStart`
 * hooks to perform additional wiring (e.g. starting an HTTP server).
 *
 * Usage:
 * ```ts
 * import { app } from './AppContext.generated.js'
 * await app.start()
 * ```
 */
export class GoodieBuilder {
  private readonly hooks: Array<(ctx: ApplicationContext) => Promise<void>> =
    [];

  constructor(private readonly definitions: ComponentDefinition[]) {}

  /**
   * Register a hook that runs after the ApplicationContext is created.
   * Used by generated code to wire plugin behaviour (e.g. starting an HTTP server).
   */
  onStart(hook: (ctx: ApplicationContext) => Promise<void>): this {
    this.hooks.push(hook);
    return this;
  }

  /** Build and start the ApplicationContext, then run all onStart hooks. */
  async start(): Promise<ApplicationContext> {
    const ctx = await ApplicationContext.create(this.definitions);
    try {
      for (const hook of this.hooks) {
        await hook(ctx);
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

  /** Create a builder pre-loaded with the given bean definitions. */
  static build(definitions: ComponentDefinition[]): GoodieBuilder {
    return new GoodieBuilder(definitions);
  }
}
