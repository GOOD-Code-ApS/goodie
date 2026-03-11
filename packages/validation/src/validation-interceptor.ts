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
 * Uses `paramIndex` to locate the correct argument in the method's arg list,
 * since the body parameter may not be at index 0 (e.g. `update(id: string, body: Dto)`).
 */
@Singleton()
export class ValidationInterceptor implements MethodInterceptor {
  constructor(private readonly schemaFactory: ValiSchemaFactory) {}

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const target = ctx.target as {
      constructor: new (...args: any[]) => unknown;
    };
    const methodMeta = MetadataRegistry.INSTANCE.getMethodParams(
      target.constructor,
      ctx.methodName,
    );

    if (methodMeta) {
      const { paramTypes, paramIndex } = methodMeta;
      for (let i = 0; i < paramTypes.length; i++) {
        const paramType = paramTypes[i];
        const schema = this.schemaFactory.getSchema(paramType);
        if (!schema) continue;

        const arg = ctx.args[paramIndex + i];
        if (arg === undefined || arg === null) continue;

        v.parse(schema, arg);
      }
    }

    return ctx.proceed();
  }
}
