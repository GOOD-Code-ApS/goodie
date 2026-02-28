import { META, pushMeta } from './metadata.js';

/** Options for the @Value decorator. */
export interface ValueOptions {
  /** Default value when the config key is missing. */
  default?: unknown;
}

/**
 * Injects a configuration value by key.
 *
 * The config source is a bean registered under the `__Goodie_Config` token,
 * which defaults to `process.env` and can be overridden via `createContext(config)`.
 *
 * @param key  The config key to inject (e.g. `'DB_URL'`)
 * @param options  Optional default value
 *
 * @example
 * @Singleton()
 * class DbService {
 *   @Value('DB_URL') accessor dbUrl!: string
 *   @Value('PORT', { default: 3000 }) accessor port!: number
 * }
 */
export function Value(
  key: string,
  options?: ValueOptions,
): FieldDecorator_Stage3 {
  return (_target, context) => {
    const meta: { fieldName: string | symbol; key: string; default?: unknown } =
      {
        fieldName: context.name,
        key,
      };
    if (options?.default !== undefined) {
      meta.default = options.default;
    }
    pushMeta(context.metadata!, META.VALUE, meta);
  };
}

type FieldDecorator_Stage3 = (
  target: ClassAccessorDecoratorTarget<unknown, unknown>,
  context: ClassAccessorDecoratorContext,
) => void;
