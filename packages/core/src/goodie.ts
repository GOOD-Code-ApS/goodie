import { ApplicationContext } from './application-context.js';
import type { ComponentDefinition } from './component-definition.js';
import { OnStart } from './on-start.js';

/**
 * Fluent builder for bootstrapping an ApplicationContext.
 *
 * Obtained via `Goodie.build(definitions)`. Call `.start()` to create
 * and initialize the context. After context creation, discovers all
 * `OnStart` beans (sorted by `@Order()`) and executes them.
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
   * @deprecated Use `OnStart` beans with `@Order()` instead.
   */
  onStart(hook: (ctx: ApplicationContext) => Promise<void>): this {
    this.hooks.push(hook);
    return this;
  }

  /** Build and start the ApplicationContext, then run all onStart hooks and OnStart beans. */
  async start(): Promise<ApplicationContext> {
    const ctx = await ApplicationContext.create(this.definitions);
    try {
      // Legacy hooks (from codegen `app.onStart()` calls)
      for (const hook of this.hooks) {
        await hook(ctx);
      }

      // Discover OnStart beans via baseTokens, sort by @Order() metadata
      const defs = ctx.getDefinitions();
      const onStartDefs = defs
        .filter((def) => def.baseTokens?.includes(OnStart as any))
        .sort((a, b) => {
          const orderA = (a.metadata.order as number) ?? 0;
          const orderB = (b.metadata.order as number) ?? 0;
          return orderA - orderB;
        });

      for (const def of onStartDefs) {
        const bean = ctx.get(def.token) as OnStart;
        await bean.onStart(ctx);
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
