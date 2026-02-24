import { Singleton } from '@goodie-ts/decorators';
import { Order } from './model.js';
import type { Repository } from './Repository.js';

@Singleton()
export class OrderService {
  constructor(private orderRepo: Repository<Order>) {}

  placeOrder(id: string, userId: string, total: number): void {
    this.orderRepo.add(new Order(id, userId, total));
  }

  listOrders(): Order[] {
    return this.orderRepo.findAll();
  }
}
