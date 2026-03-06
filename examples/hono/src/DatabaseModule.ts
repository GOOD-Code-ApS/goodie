import { Module, Provides } from '@goodie-ts/core';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { KyselyDatabase } from '@goodie-ts/kysely';
import type { Kysely } from 'kysely';
import type { Database as DB } from './db/schema.js';

@Module()
export class DatabaseModule {
  constructor(private db: KyselyDatabase) {}

  @Provides()
  typedKysely(): Kysely<DB> {
    return this.db.kysely as Kysely<DB>;
  }
}
