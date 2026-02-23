import { Module, Provides } from '@goodie/decorators';
import type { Order, User } from './model.js';
import { Repository } from './Repository.js';

@Module()
export class AppModule {
  @Provides()
  userRepository(): Repository<User> {
    return new Repository<User>();
  }

  @Provides()
  orderRepository(): Repository<Order> {
    return new Repository<Order>();
  }

  @Provides()
  appName(): string {
    return 'goodie basic example';
  }
}
