import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

/**
 * Supported server runtimes.
 *
 * - `'node'` / `'bun'` / `'deno'` — `EmbeddedServer` starts a long-running server
 * - `'cloudflare'` — serverless: codegen skips `startServer()` and `EmbeddedServer` import
 */
export type ServerRuntime = 'node' | 'bun' | 'deno' | 'cloudflare';

@Singleton()
@ConfigurationProperties('server')
export class ServerConfig {
  host = 'localhost';
  port = 3000;
  runtime: ServerRuntime = 'node';
}
