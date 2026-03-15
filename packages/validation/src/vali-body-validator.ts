import { Singleton } from '@goodie-ts/core';
import { BodyValidator } from '@goodie-ts/http';
import * as v from 'valibot';

import type { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * Valibot-based body validator.
 *
 * Registered as a `BodyValidator` library component via `baseTokens: [BodyValidator]`.
 * When present in the DI context, adapter plugins (e.g. Hono) call `validate()`
 * on parsed request bodies before passing them to controller methods.
 *
 * Delegates to `ValiSchemaFactory` for schema lookup — types not in
 * `MetadataRegistry` (not `@Introspected`) pass through unvalidated.
 * This makes validation automatic for `@Introspected` body types and
 * a no-op for everything else.
 */
@Singleton()
export class ValiBodyValidator extends BodyValidator {
  constructor(private readonly schemaFactory: ValiSchemaFactory) {
    super();
  }

  validate<T>(type: new (...args: any[]) => T, body: unknown): T {
    const schema = this.schemaFactory.getSchema(type);
    if (!schema) return body as T;
    return v.parse(schema, body) as T;
  }
}
