import { ConfigurationProperties, Singleton, Value } from '@goodie-ts/core';

/**
 * Configuration for OpenAPI spec generation.
 *
 * Populated from `openapi.*` config properties (e.g. `config/default.json`).
 */
@Singleton()
@ConfigurationProperties('openapi')
export class OpenApiConfig {
  @Value('openapi.title', { default: 'API' })
  accessor title: string = 'API';

  @Value('openapi.version', { default: '1.0.0' })
  accessor version: string = '1.0.0';

  @Value('openapi.description', { default: '' })
  accessor description: string = '';
}
