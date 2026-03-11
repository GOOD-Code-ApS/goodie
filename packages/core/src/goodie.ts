import { ApplicationContext } from './application-context.js';
import type { BeanDefinition } from './bean-definition.js';

/**
 * Interface for embedded servers that auto-start during `app.start()`.
 *
 * This is a structural interface — the abstract class lives in `@goodie-ts/http`.
 * Core uses duck-typing to avoid a hard dependency on the http package.
 */
interface EmbeddedServerLike {
  start(ctx: ApplicationContext): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Fluent builder for bootstrapping an ApplicationContext.
 *
 * Obtained via `Goodie.build(definitions)`. Call `.start()` to create
 * and initialize the context.
 *
 * If an `EmbeddedServer` bean is registered (e.g. from `@goodie-ts/hono`),
 * it is automatically started — no manual wiring needed in `main.ts`.
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

  constructor(private readonly definitions: BeanDefinition[]) {}

  /**
   * Register a hook that runs after the ApplicationContext is created.
   * Used by generated code to wire plugin behaviour.
   */
  onStart(hook: (ctx: ApplicationContext) => Promise<void>): this {
    this.hooks.push(hook);
    return this;
  }

  /**
   * Build and start the ApplicationContext, then run all onStart hooks.
   *
   * If an `EmbeddedServer` bean exists, it is auto-started after hooks complete.
   */
  async start(): Promise<ApplicationContext> {
    const ctx = await ApplicationContext.create(this.definitions);
    try {
      for (const hook of this.hooks) {
        await hook(ctx);
      }
      await this.startEmbeddedServer(ctx);
    } catch (err) {
      await ctx.close().catch(() => {});
      throw err;
    }
    return ctx;
  }

  /**
   * Discover an EmbeddedServer bean (from @goodie-ts/http adapters) and start it.
   *
   * Uses duck-typing to avoid a hard dependency on @goodie-ts/http.
   * Looks for beans with a `baseToken` whose description/name is 'EmbeddedServer'.
   */
  private async startEmbeddedServer(ctx: ApplicationContext): Promise<void> {
    for (const def of ctx.getDefinitions()) {
      const bases = def.baseTokens ?? [];
      const isEmbeddedServer = bases.some(
        (base) => typeof base === 'function' && base.name === 'EmbeddedServer',
      );
      if (isEmbeddedServer) {
        const server = ctx.get(def.token) as EmbeddedServerLike;
        await server.start(ctx);
        return;
      }
    }
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
  static build(definitions: BeanDefinition[]): GoodieBuilder {
    return new GoodieBuilder(definitions);
  }
}
