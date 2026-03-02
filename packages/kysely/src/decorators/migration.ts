const MIGRATION_NAME = Symbol('goodie:migration-name');

type ClassDecorator_Stage3 = (
  target: new (...args: never) => unknown,
  context: ClassDecoratorContext,
) => void;

/**
 * Mark a class as a Kysely migration with a unique name.
 *
 * At compile time, the Kysely transformer plugin discovers @Migration classes
 * and wires them into an auto-managed MigrationRunner.
 *
 * Classes should extend {@link AbstractMigration} which enforces the required
 * `up()` method and optional `down()` method at compile time.
 *
 * @param name - Unique migration key, e.g. '001_create_todos'. Migrations
 *   are executed in lexicographic order by name.
 */
export function Migration(name: string): ClassDecorator_Stage3 {
  return (_target, context) => {
    context.metadata![MIGRATION_NAME] = name;
  };
}

/** Read the migration name from a migration instance's Symbol.metadata. */
export function getMigrationName(instance: object): string | undefined {
  const meta = (instance.constructor as any)[Symbol.metadata];
  return meta?.[MIGRATION_NAME];
}
