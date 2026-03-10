import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import * as v from 'valibot';
import type { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * AOP interceptor for `@Validated` methods.
 *
 * Reads `paramTypes` from `ctx.metadata` — an array of class constructors
 * set by the transformer's AOP wiring. For each param type that has
 * an introspection schema, validates the corresponding argument via
 * `v.parse()`.
 *
 * For `Request<T>` parameters, validates `request.body` against the
 * schema for `T` (the type arg).
 */
@Singleton()
export class ValidationInterceptor implements MethodInterceptor {
  constructor(private readonly schemaFactory: ValiSchemaFactory) {}

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const meta = ctx.metadata as
      | { paramTypes?: Array<new (...args: any[]) => unknown> }
      | undefined;

    if (meta?.paramTypes) {
      for (let i = 0; i < meta.paramTypes.length; i++) {
        const paramType = meta.paramTypes[i];
        const schema = this.schemaFactory.getSchema(paramType);
        if (!schema) continue;

        const arg = ctx.args[i];
        if (arg === undefined || arg === null) continue;

        // If the argument has a `body` property (Request<T> pattern),
        // validate the body against the schema for T
        if (
          typeof arg === 'object' &&
          'body' in arg &&
          arg.body !== undefined
        ) {
          v.parse(schema, arg.body);
        } else {
          v.parse(schema, arg);
        }
      }
    }

    return ctx.proceed();
  }
}
