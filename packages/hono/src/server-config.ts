import { ConfigurationProperties, Singleton } from '@goodie-ts/core';

@Singleton()
@ConfigurationProperties('server')
export class ServerConfig {
  host = 'localhost';
  port = 3000;
}
