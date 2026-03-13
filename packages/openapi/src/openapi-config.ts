import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

/**
 * Configuration for OpenAPI spec generation.
 *
 * Reads from `openapi.*` config properties:
 * ```json
 * {
 *   "openapi": {
 *     "title": "My API",
 *     "version": "1.0.0",
 *     "description": "A description of the API"
 *   }
 * }
 * ```
 */
@Singleton()
@ConfigurationProperties('openapi')
export class OpenApiConfig {
  accessor title: string = 'API';
  accessor version: string = '0.0.1';
  accessor description: string = '';
}
