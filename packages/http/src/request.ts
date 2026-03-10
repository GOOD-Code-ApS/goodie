import { Introspected } from '@goodie-ts/core';

/**
 * Typed HTTP request wrapper. The type parameter `T` represents the
 * request body type.
 *
 * In controller methods, `Request<T>` is the parameter type. The adapter
 * (e.g. Hono) constructs the `Request<T>` instance from the raw HTTP
 * request, parsing the body for methods that carry one (POST, PUT, PATCH).
 *
 * Methods that don't need a body can use `Request` (defaults to `unknown`).
 *
 * Decorated with `@Introspected` so that compile-time metadata is generated
 * for the body type `T`, enabling validation and OpenAPI spec generation.
 */
@Introspected()
export class Request<T = unknown> {
  readonly body: T;
  readonly headers: Headers;
  readonly query: URLSearchParams;
  readonly params: Record<string, string>;

  constructor(options: {
    body: T;
    headers?: Headers;
    query?: URLSearchParams;
    params?: Record<string, string>;
  }) {
    this.body = options.body;
    this.headers = options.headers ?? new Headers();
    this.query = options.query ?? new URLSearchParams();
    this.params = options.params ?? {};
  }
}
