import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { MetadataRegistry, Singleton } from '@goodie-ts/core';
import * as v from 'valibot';
import type { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * AOP interceptor for `@Validated` methods.
 *
 * Looks up parameter entries from `MetadataRegistry.getMethodParams()` —
 * populated at startup by the validation transformer plugin. For each
 * class-typed param that has an introspection schema, validates the
 * corresponding argument via `v.parse()`.
 *
 * Each entry carries its own `paramIndex` to locate the correct argument,
 * supporting non-contiguous class-typed params (e.g. `process(id: string, auth: AuthToken, name: string, body: UpdateDto)`).
 */
@Singleton()
export class ValidationInterceptor implements MethodInterceptor {
  constructor(private readonly schemaFactory: ValiSchemaFactory) {}

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const target = ctx.target as {
      constructor: new (...args: any[]) => unknown;
    };
    const entries = MetadataRegistry.INSTANCE.getMethodParams(
      target.constructor,
      ctx.methodName,
    );

    if (entries) {
      for (const { paramType, paramIndex } of entries) {
        const schema = this.schemaFactory.getSchema(paramType);
        if (!schema) continue;

        const arg = ctx.args[paramIndex];
        if (arg === undefined || arg === null) continue;

        v.parse(schema, arg);
      }
    }

    return ctx.proceed();
  }
}
