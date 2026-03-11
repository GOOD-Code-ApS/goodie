import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { MetadataRegistry, Singleton } from '@goodie-ts/core';
import * as v from 'valibot';
import type { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * AOP interceptor for `@Validated` methods.
 *
 * Looks up parameter types from `MetadataRegistry.getMethodParams()` —
 * populated at startup by the validation transformer plugin. For each
 * param type that has an introspection schema, validates the corresponding
 * argument via `v.parse()`.
 *
 * For `Request<T>` parameters, validates `request.body` against the
 * schema for `T` (the type arg).
 */
@Singleton()
export class ValidationInterceptor implements MethodInterceptor {
  constructor(private readonly schemaFactory: ValiSchemaFactory) {}

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const target = ctx.target as {
      constructor: new (...args: any[]) => unknown;
    };
    const paramTypes = MetadataRegistry.INSTANCE.getMethodParams(
      target.constructor,
      ctx.methodName,
    );

    if (paramTypes) {
      for (let i = 0; i < paramTypes.length; i++) {
        const paramType = paramTypes[i];
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
