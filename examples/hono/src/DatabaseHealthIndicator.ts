import { Singleton } from '@goodie-ts/core';
import type { HealthIndicator, HealthResult } from '@goodie-ts/health';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { Kysely } from 'kysely';
import type { Database as DB } from './db/schema.js';

@Singleton()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly kysely: Kysely<DB>) {}

  async check(): Promise<HealthResult> {
    try {
      await this.kysely.selectFrom('todos').select('id').limit(1).execute();
      return { status: 'UP' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'DOWN', details: { error: message } };
    }
  }
}
