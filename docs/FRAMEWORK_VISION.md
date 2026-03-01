# Framework Vision — Ecosystem Packages

> Future integration packages that extend goodie-ts with database, caching, and observability support.

## Package Strategy

| Package | Status | Purpose |
|---------|--------|---------|
| `@goodie-ts/core` | Released | Runtime container, BeanDefinition, InjectionToken |
| `@goodie-ts/decorators` | Released | @Injectable, @Singleton, @Module, @Provides, etc. |
| `@goodie-ts/transformer` | Released | ts-morph scanner, resolver, codegen |
| `@goodie-ts/vite-plugin` | Released | Vite integration, HMR |
| `@goodie-ts/testing` | Released | TestContext with bean overrides |
| `@goodie-ts/cli` | Released | CLI for code generation |
| `@goodie-ts/kysely` | Planned | Kysely integration with connection management |
| `@goodie-ts/redis` | Planned | Redis integration with @Cacheable |
| `@goodie-ts/health` | Planned | Health checks and readiness probes |

---

## Planned Packages

### @goodie-ts/kysely

Type-safe SQL query builder integration using Kysely. Provides connection management, transaction support, and repository patterns.

#### Database Schema — TypeScript Interface

Kysely uses plain TypeScript interfaces to define the database schema. No DSL or code generation required:

```typescript
import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  users: UserTable;
  posts: PostTable;
}

export interface UserTable {
  id: Generated<string>;
  name: string;
  email: string;
  created_at: Generated<Date>;
}

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;
```

#### Repository Pattern — Query Builder

Repositories use Kysely's type-safe query builder API:

```typescript
@Singleton()
export class UserRepository {
  constructor(private database: KyselyDatabase) {}

  async findAll(): Promise<User[]> {
    return this.database.kysely
      .selectFrom('users')
      .selectAll()
      .execute();
  }

  async findById(id: string): Promise<User | undefined> {
    return this.database.kysely
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(data: NewUser): Promise<User> {
    return this.database.kysely
      .insertInto('users')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
```

#### KyselyDatabase Wrapper — @Value + @PostConstruct

The `KyselyDatabase` class wraps the Kysely instance, using `@Value` for config injection and `@PostConstruct` for initializing the connection pool:

```typescript
import { PostConstruct, Singleton, Value } from '@goodie-ts/decorators';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './db/schema.js';

@Singleton()
export class KyselyDatabase {
  @Value('DATABASE_URL', { default: 'postgres://localhost:5432/mydb' })
  accessor databaseUrl!: string;

  kysely!: Kysely<Database>;

  @PostConstruct()
  init() {
    const pool = new pg.Pool({ connectionString: this.databaseUrl });
    this.kysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }
}
```

---

### @Transactional

Transaction support using Kysely's built-in transaction API. The `@Transactional` decorator wraps a method in a database transaction:

#### Kysely Transaction API

```typescript
@Singleton()
export class UserService {
  constructor(
    private database: KyselyDatabase,
    private userRepository: UserRepository,
    private auditRepository: AuditRepository,
  ) {}

  @Transactional()
  async createUser(data: NewUser): Promise<User> {
    return this.database.kysely.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('audit_log')
        .values({
          action: 'USER_CREATED',
          entity_id: user.id,
          timestamp: new Date(),
        })
        .execute();

      return user;
    });
  }
}
```

#### Transaction Propagation

Transactions can be nested using Kysely's `transaction().execute()`. The outer transaction controls the commit/rollback boundary:

```typescript
@Singleton()
export class OrderService {
  constructor(private database: KyselyDatabase) {}

  async placeOrder(order: NewOrder): Promise<Order> {
    return this.database.kysely.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('orders')
        .values(order)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('inventory')
        .set((eb) => ({
          quantity: eb('quantity', '-', order.quantity),
        }))
        .where('product_id', '=', order.product_id)
        .execute();

      return created;
    });
  }
}
```

---

### @goodie-ts/redis

Redis integration with `@Cacheable`, `@CacheEvict`, and `@CachePut` decorators.

```typescript
@Singleton()
export class ProductService {
  constructor(private productRepository: ProductRepository) {}

  @Cacheable({ key: 'products:${id}', ttl: 300 })
  async findById(id: string): Promise<Product> {
    return this.productRepository.findById(id);
  }

  @CacheEvict({ key: 'products:${id}' })
  async update(id: string, data: ProductUpdate): Promise<Product> {
    return this.productRepository.update(id, data);
  }
}
```

---

### @goodie-ts/health

Health check infrastructure for readiness and liveness probes.

#### Health Indicators

```typescript
@Singleton()
export class DatabaseHealthIndicator implements HealthIndicator {
  constructor(private database: KyselyDatabase) {}

  @Health()
  async check(): Promise<HealthStatus> {
    try {
      await this.database.kysely.selectFrom('pg_catalog.pg_tables').selectAll().executeTakeFirst();
      return { status: 'UP' };
    } catch (e) {
      return { status: 'DOWN', details: { error: (e as Error).message } };
    }
  }
}
```

#### Health Endpoint

```typescript
@Singleton()
export class HealthController {
  constructor(private indicators: HealthIndicator[]) {}

  async check(): Promise<HealthResponse> {
    const results = await Promise.all(
      this.indicators.map((i) => i.check()),
    );
    const status = results.every((r) => r.status === 'UP') ? 'UP' : 'DOWN';
    return { status, checks: results };
  }
}
```
