import { ConfigurationProperties } from '@goodie-ts/config';
import { Singleton } from '@goodie-ts/decorators';

@Singleton()
@ConfigurationProperties('server')
export class ServerConfig {
  host = 'localhost';
  port = 3000;
}
