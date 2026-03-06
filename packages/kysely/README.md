# @goodie-ts/kysely

[Kysely](https://kysely.dev/) integration for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — declarative transactions, auto-wired migrations, and a CRUD repository base class.

## Install

```bash
pnpm add @goodie-ts/kysely kysely
```

## Overview

Provides `@Transactional` for declarative transaction management, `@Migration` for auto-discovered database migrations, and `CrudRepository<T>` for common CRUD operations. All backed by `TransactionManager` which uses `AsyncLocalStorage` for transaction propagation.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Transactional({ propagation? })` | method | Wraps method in a database transaction |
| `@Migration('name')` | class | Marks a class as a migration (sorted by name) |

## Usage

```typescript
import { Singleton } from '@goodie-ts/core';
import { Transactional, CrudRepository, TransactionManager } from '@goodie-ts/kysely';

@Singleton()
class TodoRepository extends CrudRepository<Todo> {
  constructor(transactionManager: TransactionManager) {
    super('todos', transactionManager);
  }
}

@Singleton()
class TodoService {
  constructor(private repo: TodoRepository) {}

  @Transactional()
  async createMany(titles: string[]) {
    for (const title of titles) {
      await this.repo.save({ title, completed: false });
    }
    // All-or-nothing: rolls back on error
  }
}
```

## Migrations

```typescript
import { Migration, AbstractMigration } from '@goodie-ts/kysely';
import type { Kysely } from 'kysely';

@Migration('001_create_todos')
class CreateTodosTable extends AbstractMigration {
  async up(db: Kysely<any>) {
    await db.schema.createTable('todos')
      .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('title', 'text', c => c.notNull())
      .execute();
  }
}
```

Migrations run automatically at startup via `MigrationRunner` (`@PostConstruct`), sorted by name.

## Vite Plugin Setup

```typescript
import { diPlugin } from '@goodie-ts/vite-plugin';
import { createKyselyPlugin } from '@goodie-ts/kysely';

export default defineConfig({
  plugins: [
    diPlugin({
      plugins: [createKyselyPlugin({ database: 'Database' })],
    }),
  ],
});
```

The `database` option specifies the class name of your Kysely wrapper (a `@Singleton` with a `.kysely` property).

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
