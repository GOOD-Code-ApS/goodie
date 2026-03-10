/**
 * Typed HTTP response. Controller methods return `Response<T>` which
 * adapters translate to framework-specific responses.
 *
 * Use the static factories: `Response.ok()`, `Response.created()`,
 * `Response.noContent()`, `Response.status()`.
 *
 * Fluent `.header()` for adding response headers:
 *   `Response.ok(data).header('X-Custom', 'value')`
 */
export class Response<T> {
  readonly status: number;
  readonly body: T | undefined;
  readonly headers: Record<string, string>;

  private constructor(
    status: number,
    body: T | undefined,
    headers: Record<string, string>,
  ) {
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  /** Add a response header. Returns a new Response (immutable). */
  header(name: string, value: string): Response<T> {
    return new Response(this.status, this.body, {
      ...this.headers,
      [name]: value,
    });
  }

  /** 200 OK with body. */
  static ok<T>(body: T, headers?: Record<string, string>): Response<T> {
    return new Response(200, body, headers ?? {});
  }

  /** 201 Created with body. */
  static created<T>(body: T, headers?: Record<string, string>): Response<T> {
    return new Response(201, body, headers ?? {});
  }

  /** 204 No Content. */
  static noContent(headers?: Record<string, string>): Response<never> {
    return new Response(204, undefined, headers ?? {}) as Response<never>;
  }

  /** Custom status with optional body. */
  static status<T>(
    code: number,
    body?: T,
    headers?: Record<string, string>,
  ): Response<T> {
    return new Response(code, body, headers ?? {});
  }
}
