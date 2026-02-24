import { MockDefinition, TestContext } from '@goodie-ts/testing';
import { describe, expect, it } from 'vitest';
import {
  definitions,
  Repository_Order_Token,
  Repository_User_Token,
} from '../src/AppContext.generated.js';
import { Order, User } from '../src/model.js';
import { OrderService } from '../src/OrderService.js';
import { Repository } from '../src/Repository.js';
import { UserService } from '../src/UserService.js';

// ── Mock repositories ────────────────────────────────────────────────

@MockDefinition(Repository_User_Token)
class MockUserRepository extends Repository<User> {
  constructor() {
    super();
    this.add(new User('mock-1', 'Mock Alice'));
    this.add(new User('mock-2', 'Mock Bob'));
  }
}

@MockDefinition(Repository_Order_Token)
class MockOrderRepository extends Repository<Order> {
  constructor() {
    super();
    this.add(new Order('mock-o1', 'mock-1', 99.99));
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('basic example — @MockDefinition + .mock()', () => {
  it('UserService receives mocked user repository', async () => {
    const ctx = await TestContext.from(definitions)
      .mock(MockUserRepository)
      .build();

    const users = ctx.get(UserService).listUsers();
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('Mock Alice');
    expect(users[1].name).toBe('Mock Bob');
  });

  it('OrderService receives mocked order repository', async () => {
    const ctx = await TestContext.from(definitions)
      .mock(MockOrderRepository)
      .build();

    const orders = ctx.get(OrderService).listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('mock-o1');
    expect(orders[0].total).toBe(99.99);
  });

  it('mocking user repo does not affect order repo', async () => {
    const ctx = await TestContext.from(definitions)
      .mock(MockUserRepository)
      .build();

    // Order repo is the real (empty) one — no pre-seeded data
    expect(ctx.get(OrderService).listOrders()).toHaveLength(0);
    // User repo is the mock
    expect(ctx.get(UserService).listUsers()).toHaveLength(2);
  });

  it('can mock both repositories at once', async () => {
    const ctx = await TestContext.from(definitions)
      .mock(MockUserRepository, MockOrderRepository)
      .build();

    expect(ctx.get(UserService).listUsers()).toHaveLength(2);
    expect(ctx.get(OrderService).listOrders()).toHaveLength(1);
  });

  it('operations on mocked context do not leak to a second context', async () => {
    const builder = TestContext.from(definitions).mock(MockUserRepository);

    const ctx1 = await builder.build();
    const ctx2 = await builder.build();

    ctx1.get(UserService).addUser('extra', 'Extra User');

    expect(ctx1.get(UserService).listUsers()).toHaveLength(3);
    expect(ctx2.get(UserService).listUsers()).toHaveLength(2);
  });
});
