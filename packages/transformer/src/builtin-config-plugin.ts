import type { ClassVisitorContext, TransformerPlugin } from './options.js';

/**
 * Built-in config transformer plugin.
 *
 * Scans `@ConfigurationProperties(prefix)` on classes that also have
 * `@Singleton` (or `@Injectable`). For each public class field, generates a
 * `valueFields` metadata entry with key `prefix.fieldName` and the
 * field initializer as the default value.
 *
 * Private and protected fields (by TypeScript modifier or underscore prefix)
 * are excluded. A warning is emitted if `@ConfigurationProperties` is used
 * without a companion `@Singleton` or `@Injectable` decorator.
 *
 * The existing codegen automatically handles `valueFields` — it creates
 * the `__Goodie_Config` token, adds it as a dependency, and generates
 * factory code that assigns `config` parameter values (which override
 * `process.env` defaults).
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

      // Validate that a bean decorator is present
      const hasBeanDecorator = decorators.some((d) => {
        const name = d.getName();
        return (
          name === 'Singleton' ||
          name === 'Injectable' ||
          name === 'RequestScoped'
        );
      });
      if (!hasBeanDecorator) {
        const className = ctx.classDeclaration.getName() ?? '<anonymous>';
        console.warn(
          `[config] @ConfigurationProperties on '${className}' requires @Singleton or @Injectable — config values will not be injected.`,
        );
        return;
      }

      // Extract prefix from first argument
      const args = configDec.getArguments();
      if (args.length === 0) {
        const className = ctx.classDeclaration.getName() ?? '<anonymous>';
        console.warn(
          `[config] @ConfigurationProperties on '${className}' is missing a prefix argument — config values will not be injected.`,
        );
        return;
      }

      const prefixArg = args[0].getText();
      // Only string literals are supported — variable references, template literals, etc.
      // would silently produce the identifier text as the prefix (e.g. MY_PREFIX instead of its value).
      if (
        !(
          (prefixArg.startsWith("'") && prefixArg.endsWith("'")) ||
          (prefixArg.startsWith('"') && prefixArg.endsWith('"'))
        )
      ) {
        const className = ctx.classDeclaration.getName() ?? '<anonymous>';
        console.warn(
          `[config] @ConfigurationProperties on '${className}' has a non-literal prefix argument '${prefixArg}' — only single-quoted or double-quoted string literals are supported. Skipping config generation for this class.`,
        );
        return;
      }
      const prefix = prefixArg.slice(1, -1);

      // Extract class fields (both regular and accessor properties)
      const fields: Array<{
        fieldName: string;
        defaultValue: string | undefined;
      }> = [];

      for (const prop of ctx.classDeclaration.getProperties()) {
        const fieldName = prop.getName();

        // Skip private/protected fields (by TypeScript modifier or convention)
        const scope = prop.getScope();
        if (scope === 'private' || scope === 'protected') continue;
        if (fieldName.startsWith('_')) continue;

        // Skip fields already decorated with @Value (handled by the scanner)
        if (prop.getDecorators().some((d) => d.getName() === 'Value')) continue;

        // Get default value from initializer
        const initializer = prop.getInitializer();
        const defaultValue = initializer ? initializer.getText() : undefined;

        fields.push({ fieldName, defaultValue });
      }

      if (fields.length === 0) return;

      // Merge valueFields metadata — codegen handles the rest.
      const newFields = fields.map((f) => ({
        fieldName: f.fieldName,
        key: `${prefix}.${f.fieldName}`,
        default: f.defaultValue,
      }));
      const existing = ctx.metadata.valueFields as
        | Array<{ fieldName: string; key: string; default?: string }>
        | undefined;
      ctx.metadata.valueFields = existing
        ? [...existing, ...newFields]
        : newFields;
    },
  };
}
