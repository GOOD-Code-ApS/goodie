/**
 * Typed HTTP request wrapper. The type parameter `T` represents the
 * request body type, which must be `@Introspected` for compile-time
 * validation metadata extraction.
 *
 * In framework-managed controller methods, `Request<T>` is the parameter
 * type. The adapter (e.g. Hono) constructs the `Request<T>` instance
 * from the raw HTTP request, parsing and validating the body against
 * the introspected type metadata.
 */
export class Request<T> {
  readonly body: T;
  readonly headers: ReadonlyMap<string, string>;
  readonly query: ReadonlyMap<string, string>;
  readonly params: ReadonlyMap<string, string>;

  constructor(options: {
    body: T;
    headers?: ReadonlyMap<string, string>;
    query?: ReadonlyMap<string, string>;
    params?: ReadonlyMap<string, string>;
  }) {
    this.body = options.body;
    this.headers = options.headers ?? new Map();
    this.query = options.query ?? new Map();
    this.params = options.params ?? new Map();
  }
}
