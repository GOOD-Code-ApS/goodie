import type { Principal } from './principal.js';

/**
 * Hono environment type for goodie-ts applications.
 *
 * Use as the generic parameter for `Hono` to get typed access to the
 * authenticated principal via `c.get('principal')`.
 *
 * @example
 * ```typescript
 * import type { GoodieEnv } from '@goodie-ts/hono';
 *
 * // In a controller method:
 * getData(c: Context<GoodieEnv>) {
 *   const principal = c.get('principal'); // typed as Principal | undefined
 * }
 * ```
 */
export interface GoodieEnv {
  Variables: {
    principal: Principal | undefined;
  };
}
