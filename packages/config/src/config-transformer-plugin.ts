import type {
  ClassVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Create the config transformer plugin.
 *
 * Scans `@ConfigurationProperties(prefix)` on classes that also have
 * `@Singleton` (or `@Injectable`). For each class field, generates a
 * `valueFields` metadata entry with key `prefix.fieldName` and the
 * field initializer as the default value.
 *
 * The existing codegen automatically handles `valueFields` — it creates
 * the `__Goodie_Config` token, adds it as a dependency, and generates
 * factory code that assigns config values.
 */
export function createConfigPlugin(): TransformerPlugin {
  return {
    name: 'config',

    visitClass(ctx: ClassVisitorContext): void {
      const decorators = ctx.classDeclaration.getDecorators();

      const configDec = decorators.find(
        (d) => d.getName() === 'ConfigurationProperties',
      );
      if (!configDec) return;

      // Extract prefix from first argument
      const args = configDec.getArguments();
      if (args.length === 0) return;

      const prefixArg = args[0].getText();
      let prefix: string;
      if (
        (prefixArg.startsWith("'") && prefixArg.endsWith("'")) ||
        (prefixArg.startsWith('"') && prefixArg.endsWith('"'))
      ) {
        prefix = prefixArg.slice(1, -1);
      } else {
        prefix = prefixArg;
      }

      // Extract class fields (both regular and accessor properties)
      const fields: Array<{
        fieldName: string;
        defaultValue: string | undefined;
      }> = [];

      for (const prop of ctx.classDeclaration.getProperties()) {
        const fieldName = prop.getName();

        // Skip private/protected fields starting with underscore (convention)
        if (fieldName.startsWith('_')) continue;

        // Get default value from initializer
        const initializer = prop.getInitializer();
        const defaultValue = initializer ? initializer.getText() : undefined;

        fields.push({ fieldName, defaultValue });
      }

      if (fields.length === 0) return;

      // Set valueFields metadata — codegen handles the rest
      ctx.metadata.valueFields = fields.map((f) => ({
        fieldName: f.fieldName,
        key: `${prefix}.${f.fieldName}`,
        default: f.defaultValue,
      }));
    },
  };
}
