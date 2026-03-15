import { Factory, Provides } from '@goodie-ts/core';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { KyselyDatabase } from '@goodie-ts/kysely';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';

@Factory()
export class DatabaseModule {
  constructor(private db: KyselyDatabase) {}

  @Provides()
  typedKysely(): Kysely<Database> {
    return this.db.kysely as Kysely<Database>;
  }
}
