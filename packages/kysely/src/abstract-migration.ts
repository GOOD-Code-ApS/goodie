import type { Kysely } from 'kysely';

/**
 * Abstract base class for Kysely migrations.
 *
 * Extend this class and decorate with `@Migration('name')` to define a
 * migration that is auto-discovered and executed by the MigrationPostProcessor
 * when KyselyDatabase is initialized.
 *
 * @example
 * ```typescript
 * @Migration('001_create_users')
 * export class CreateUsersTable extends AbstractMigration {
 *   async up(db: Kysely<any>) {
 *     await db.schema.createTable('users')
 *       .addColumn('id', 'uuid', c => c.primaryKey())
 *       .execute();
 *   }
 *
 *   async down(db: Kysely<any>) {
 *     await db.schema.dropTable('users').execute();
 *   }
 * }
 * ```
 */
export abstract class AbstractMigration {
  abstract up(db: Kysely<any>): Promise<void>;
  down?(db: Kysely<any>): Promise<void>;
}
