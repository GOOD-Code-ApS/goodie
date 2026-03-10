/**
 * Typed HTTP response. Controller methods return `Response<T>` which
 * adapters translate to framework-specific responses.
 *
 * Use the static factories: `Response.ok()`, `Response.created()`,
 * `Response.noContent()`, `Response.status()`.
 */
export class Response<T> {
  readonly status: number;
  readonly body: T | undefined;
  readonly headers: ReadonlyMap<string, string>;

  private constructor(
    status: number,
    body: T | undefined,
    headers: ReadonlyMap<string, string>,
  ) {
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  /** 200 OK with body. */
  static ok<T>(body: T, headers?: Record<string, string>): Response<T> {
    return new Response(200, body, toMap(headers));
  }

  /** 201 Created with body. */
  static created<T>(body: T, headers?: Record<string, string>): Response<T> {
    return new Response(201, body, toMap(headers));
  }

  /** 204 No Content. */
  static noContent(headers?: Record<string, string>): Response<never> {
    return new Response(204, undefined, toMap(headers));
  }

  /** Custom status with optional body. */
  static status<T>(
    code: number,
    body?: T,
    headers?: Record<string, string>,
  ): Response<T> {
    return new Response(code, body, toMap(headers));
  }
}

function toMap(
  headers: Record<string, string> | undefined,
): ReadonlyMap<string, string> {
  if (!headers) return new Map();
  return new Map(Object.entries(headers));
}
