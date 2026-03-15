# @goodie-ts/kysely

[Kysely](https://kysely.dev/) integration for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — `KyselyDatabase` library component, declarative transactions, and auto-wired migrations.

## Install

```bash
pnpm add @goodie-ts/kysely kysely
```

## Overview

Provides `KyselyDatabase` as a library-provided `@Singleton` that creates and manages a `Kysely<any>` instance from configuration. Use `@Module` with `@Provides` for typed `Kysely<DB>` access. Includes `@Transactional` for declarative transaction management, `@Migration` for auto-discovered database migrations, and `TransactionManager` with `AsyncLocalStorage` for transaction propagation.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Transactional({ propagation? })` | method | Wraps method in a database transaction |
| `@Migration('name')` | class | Marks a class as a migration (sorted by name) |

## Usage

```typescript
import { Module, Provides, Singleton } from '@goodie-ts/core';
import { KyselyDatabase, Transactional } from '@goodie-ts/kysely';
import type { Kysely } from 'kysely';

@Module()
class DatabaseModule {
  constructor(private db: KyselyDatabase) {}

  @Provides()
  typedKysely(): Kysely<Database> {
    return this.db.kysely as Kysely<Database>;
  }
}

@Singleton()
class TodoRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findAll(): Promise<Todo[]> {
    return this.db.selectFrom('todos').selectAll().execute();
  }
}

@Singleton()
class TodoService {
  constructor(private repo: TodoRepository) {}

  @Transactional()
  async createMany(titles: string[]) {
    for (const title of titles) {
      await this.repo.create(title);
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

## Supported Dialects

| Dialect | Driver Package | Edge-Compatible |
|---------|---------------|-----------------|
| `postgres` | `pg` | No |
| `mysql` | `mysql2` | No |
| `sqlite` | `better-sqlite3` | No |
| `neon` | `kysely-neon` | Yes |
| `planetscale` | `kysely-planetscale` | Yes |
| `libsql` | `@libsql/kysely-libsql` | Yes |

Configure via `config/default.json`:
```json
{ "datasource": { "url": "postgres://...", "dialect": "postgres" } }
```

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

The kysely plugin is auto-discovered — no manual `plugins` configuration needed. `KyselyDatabase` is provided as a library component.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
