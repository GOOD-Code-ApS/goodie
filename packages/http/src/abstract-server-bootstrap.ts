import { type ApplicationContext, OnStart } from '@goodie-ts/core';

/**
 * Abstract base class for HTTP server bootstrap beans.
 *
 * Concrete implementations (e.g. `HonoServerBootstrap`) extend this class
 * to create and start a framework-specific HTTP router/server.
 *
 * Discovered at startup via `OnStart` base token — `GoodieBuilder.start()`
 * calls `onStart()` after the ApplicationContext is fully initialized.
 */
export abstract class AbstractServerBootstrap extends OnStart {
  abstract onStart(ctx: ApplicationContext): Promise<void>;
}
