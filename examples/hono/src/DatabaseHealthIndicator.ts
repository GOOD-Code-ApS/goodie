import { Singleton } from '@goodie-ts/core';
import type { HealthIndicator, HealthResult } from '@goodie-ts/health';
import type { Database } from './Database.js';

@Singleton()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly database: Database) {}

  async check(): Promise<HealthResult> {
    try {
      await this.database.kysely
        .selectFrom('todos')
        .select('id')
        .limit(1)
        .execute();
      return { status: 'UP' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'DOWN', details: { error: message } };
    }
  }
}
