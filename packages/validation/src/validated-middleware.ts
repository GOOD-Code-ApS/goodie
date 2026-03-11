import type { Middleware, TypedMiddleware } from '@goodie-ts/http';
import * as v from 'valibot';
import { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * HTTP middleware that validates the request body against the schema
 * derived from an `@Introspected` DTO class.
 *
 * Uses `ValiSchemaFactory` to retrieve the Valibot schema built from
 * compile-time introspection metadata — the same mechanism as the
 * `@Validated` AOP decorator, but as a composable middleware for
 * use with `defineRoutes()`.
 *
 * Returns a `TypedMiddleware<T>` so the `RouterBuilder` overloads can
 * infer the handler's `Request<T>` body type automatically.
 *
 * Throws `ValiError` on validation failure, which `ValiExceptionHandler`
 * catches and maps to a 400 response.
 *
 * @example
 * ```typescript
 * import { validated } from '@goodie-ts/validation';
 *
 * router.post('/todos', validated(CreateTodoDto), async (req) => {
 *   req.body.title; // typed as CreateTodoDto
 *   return Response.created(await todoService.create(req.body));
 * });
 * ```
 */
export function validated<T>(
  dto: new (...args: unknown[]) => T,
  schemaFactory?: ValiSchemaFactory,
): TypedMiddleware<T> {
  let cachedSchema: v.GenericSchema | undefined;

  const mw: Middleware = async (req, next) => {
    if (!cachedSchema) {
      const factory = schemaFactory ?? resolveGlobalFactory();
      cachedSchema = factory.getSchema(dto);
      if (!cachedSchema) {
        throw new Error(
          `validated(): No schema found for ${dto.name}. ` +
            `Ensure it is decorated with @Introspected().`,
        );
      }
    }

    v.parse(cachedSchema, req.body);
    return next();
  };
  return mw as TypedMiddleware<T>;
}

/**
 * Resolve the global ValiSchemaFactory singleton.
 *
 * ValiSchemaFactory is a `@Singleton` bean — in a running application it's
 * created by the container. For the middleware to work without explicit
 * injection, we instantiate a standalone instance that reads from the
 * same global `MetadataRegistry.INSTANCE`.
 */
function resolveGlobalFactory(): ValiSchemaFactory {
  // ValiSchemaFactory reads from MetadataRegistry.INSTANCE (global singleton).
  // Creating a new instance is safe — it just builds a fresh cache.
  return new ValiSchemaFactory();
}
