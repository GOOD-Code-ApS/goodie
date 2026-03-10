import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

/**
 * Supported server runtimes.
 *
 * - `'node'` / `'bun'` / `'deno'` — `EmbeddedServer` starts a long-running server
 * - `'cloudflare'` — serverless: codegen skips `app.onStart()` hook and `EmbeddedServer` import
 */
export type ServerRuntime = 'node' | 'bun' | 'deno' | 'cloudflare';

/** CORS configuration. */
export interface CorsConfig {
  origin?: string | string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

@Singleton()
@ConfigurationProperties('server')
export class ServerConfig {
  host = 'localhost';
  port = 3000;
  runtime: ServerRuntime = 'node';
  cors: CorsConfig = {};
}
