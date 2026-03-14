import { Config, Singleton } from '@goodie-ts/core';

@Singleton()
@Config('openapi')
export class OpenApiConfig {
  title = 'API';
  version = '1.0.0';
  description = '';
}
