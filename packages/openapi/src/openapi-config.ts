import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

@Singleton()
@ConfigurationProperties('openapi')
export class OpenApiConfig {
  title = 'API';
  version = '1.0.0';
  description = '';
  path = './openapi.json';
}
