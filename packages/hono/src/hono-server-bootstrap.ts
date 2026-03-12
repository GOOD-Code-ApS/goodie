import {
  type ApplicationContext,
  ConditionalOnProperty,
  Singleton,
} from '@goodie-ts/core';
import { AbstractServerBootstrap } from '@goodie-ts/http';

import { createHonoRouter } from './create-router.js';
import type { EmbeddedServer } from './embedded-server.js';

/**
 * Bootstraps the Hono HTTP server after the ApplicationContext is initialized.
 *
 * Creates the Hono router from the DI context and starts the `EmbeddedServer`.
 * Excluded on Cloudflare Workers via `@ConditionalOnProperty` — serverless
 * deployments should call `createHonoRouter(ctx)` directly.
 */
@Singleton()
@ConditionalOnProperty('server.runtime', {
  havingValue: ['node', 'bun', 'deno'],
})
export class HonoServerBootstrap extends AbstractServerBootstrap {
  constructor(private readonly embeddedServer: EmbeddedServer) {
    super();
  }

  async onStart(ctx: ApplicationContext): Promise<void> {
    const router = createHonoRouter(ctx);
    await this.embeddedServer.listen(router);
  }
}
