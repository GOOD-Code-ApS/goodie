type Decorator_Stage3 =
  | ((
      target: new (...args: any[]) => any,
      context: ClassDecoratorContext,
    ) => void)
  | ((
      target: (...args: never) => unknown,
      context: ClassMethodDecoratorContext,
    ) => void);

/** Options passed to Hono's `cors()` middleware. */
export interface CorsOptions {
  origin?: string | string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

/**
 * Enable CORS on a controller (all routes) or a specific route method.
 *
 * This is a compile-time-only marker decorator. At build time, the hono
 * transformer plugin detects `@Cors` via AST scanning and emits Hono's
 * `cors()` middleware in the generated code. The decorator itself is a
 * no-op at runtime.
 *
 * Method-level `@Cors` overrides class-level `@Cors` for that route.
 *
 * @example
 * ```typescript
 * // Class-level: all routes get CORS
 * @Cors({ origin: 'https://example.com', allowMethods: ['GET', 'POST'] })
 * @Controller('/api')
 * class ApiController {
 *   @Get('/data')
 *   getData(c: Context) { ... }
 *
 *   // Method-level override
 *   @Cors({ origin: '*' })
 *   @Get('/public')
 *   getPublic(c: Context) { ... }
 * }
 * ```
 */
export function Cors(_options?: CorsOptions): Decorator_Stage3 {
  // No-op at runtime — the transformer reads the decorator arguments via AST
  // and generates cors() middleware in the codegen output.
  return () => {};
}
