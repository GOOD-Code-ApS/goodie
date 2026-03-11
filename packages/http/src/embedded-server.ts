import type { ApplicationContext } from '@goodie-ts/core';

/**
 * Abstract embedded HTTP server.
 *
 * Adapter packages (e.g. `@goodie-ts/hono`) provide concrete implementations.
 * `GoodieBuilder.start()` auto-discovers an `EmbeddedServer` bean and calls
 * `start(ctx)` — no manual wiring needed in `main.ts`.
 *
 * For serverless environments (e.g. Cloudflare Workers), there is no
 * `EmbeddedServer` — use `Router.fromContext(ctx)` and the adapter directly.
 */
export abstract class EmbeddedServer {
  /**
   * Start the server. Called automatically by `GoodieBuilder.start()`.
   *
   * Implementations should:
   * 1. Build a `Router` from the context
   * 2. Adapt it to the framework-specific router (Hono, Express, etc.)
   * 3. Start listening on the configured host/port
   */
  abstract start(ctx: ApplicationContext): Promise<void>;

  /** Gracefully stop the server. */
  abstract stop(): Promise<void>;
}
