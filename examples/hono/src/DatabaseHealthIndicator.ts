import { Singleton } from '@goodie-ts/core';
import type { HealthIndicator, HealthResult } from '@goodie-ts/health';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { KyselyDatabase } from '@goodie-ts/kysely';
import { sql } from 'kysely';

@Singleton()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly db: KyselyDatabase) {}

  async check(): Promise<HealthResult> {
    try {
      await sql`SELECT 1`.execute(this.db.kysely);
      return { status: 'UP' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'DOWN', details: { error: message } };
    }
  }
}
