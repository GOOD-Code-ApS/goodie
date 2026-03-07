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
 * At runtime, the migration name is stored as a non-enumerable static
 * property `__migrationName` on the class (no Symbol.metadata).
 *
 * Classes should extend {@link AbstractMigration} which enforces the required
 * `up()` method and optional `down()` method at compile time.
 *
 * @param name - Unique migration key, e.g. '001_create_todos'. Migrations
 *   are executed in lexicographic order by name.
 */
export function Migration(name: string): ClassDecorator_Stage3 {
  return (target) => {
    Object.defineProperty(target, '__migrationName', {
      value: name,
      enumerable: false,
      configurable: true,
    });
  };
}

/**
 * Read the migration name from a migration instance's class.
 * Returns `undefined` if the class has no @Migration annotation.
 */
export function getMigrationName(instance: object): string | undefined {
  return (instance.constructor as any).__migrationName as string | undefined;
}
