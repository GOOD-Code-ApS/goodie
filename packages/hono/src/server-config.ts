import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

/** Supported server runtimes. */
export type ServerRuntime = 'node' | 'bun' | 'deno' | 'cloudflare';

@Singleton()
@ConfigurationProperties('server')
export class ServerConfig {
  host = 'localhost';
  port = 3000;
  runtime: ServerRuntime = 'node';
}
