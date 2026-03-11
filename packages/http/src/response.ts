/**
 * HTTP response. Controller methods and route handlers return `Response`
 * which adapters translate to framework-specific responses.
 *
 * Use the static factories: `Response.ok()`, `Response.created()`,
 * `Response.noContent()`, `Response.status()`.
 *
 * Fluent `.header()` for adding response headers:
 *   `Response.ok(data).header('X-Custom', 'value')`
 */
export class Response {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Record<string, string>;

  private constructor(
    status: number,
    body: unknown,
    headers: Record<string, string>,
  ) {
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  /** Add a response header. Returns a new Response (immutable). */
  header(name: string, value: string): Response {
    return new Response(this.status, this.body, {
      ...this.headers,
      [name]: value,
    });
  }

  /** 200 OK with body. */
  static ok(body: unknown, headers?: Record<string, string>): Response {
    return new Response(200, body, headers ?? {});
  }

  /** 201 Created with body. */
  static created(body: unknown, headers?: Record<string, string>): Response {
    return new Response(201, body, headers ?? {});
  }

  /** 204 No Content. */
  static noContent(headers?: Record<string, string>): Response {
    return new Response(204, undefined, headers ?? {});
  }

  /** Custom status with optional body. */
  static status(
    code: number,
    body?: unknown,
    headers?: Record<string, string>,
  ): Response {
    return new Response(code, body, headers ?? {});
  }
}
