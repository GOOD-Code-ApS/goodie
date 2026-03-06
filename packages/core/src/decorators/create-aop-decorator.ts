import type { MethodInterceptor } from '../aop-types.js';

/** Base constraint for the config type parameter of `createAopDecorator`. */
export interface AopDecoratorConfig {
  /** Interceptor class (instance type) — the scanner resolves the class via its symbol. */
  interceptor: MethodInterceptor;
  /** Chain order — lower = runs first (outermost). Must be a literal type (e.g. `-100`). */
  order: number;
  /** Static metadata merged into every interceptor ref (e.g. `{ cacheAction: 'get' }`). */
  metadata?: Record<string, unknown>;
  /** Maps positional decorator args to named keys (e.g. `['cacheName']`). */
  argMapping?: readonly string[];
  /** Default values when decorator args are missing. */
  defaults?: Record<string, unknown>;
  /** Call-site argument types — purely for TypeScript inference, ignored by the scanner. */
  args?: readonly unknown[];
}

type MethodDec = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

type ExtractArgs<T> = T extends { args: readonly [...infer A] } ? A : [];

/**
 * Create a compile-time AOP decorator.
 *
 * The type parameter encodes the full AOP configuration (interceptor class,
 * order, metadata, arg mapping, defaults). At build time, the transformer's
 * AOP scanner reads the type parameter via the TypeScript type checker —
 * no runtime metadata is needed.
 *
 * @example
 * ```ts
 * // Simple — no call-site args
 * export const Log = createAopDecorator<{
 *   interceptor: LoggingInterceptor;
 *   order: -100;
 * }>();
 *
 * // With positional args
 * export const Cacheable = createAopDecorator<{
 *   interceptor: CacheInterceptor;
 *   order: -50;
 *   metadata: { cacheAction: 'get' };
 *   argMapping: ['cacheName'];
 *   args: [cacheName: string, opts?: { ttlMs?: number }];
 * }>();
 * ```
 */
export function createAopDecorator<TConfig extends AopDecoratorConfig>(): (
  ...args: ExtractArgs<TConfig>
) => MethodDec {
  return () => (_target, _context) => {
    // No-op: config is extracted at compile time from the type parameter
  };
}
