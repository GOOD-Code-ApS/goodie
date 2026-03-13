import { createAopDecorator } from '@goodie-ts/core';
import type { SecurityInterceptor } from '../security-interceptor.js';

/**
 * @Secured — restricts access to authenticated principals with the required roles.
 *
 * Can be applied at class level (all methods require auth) or method level.
 * When applied at class level, individual methods can be exempted with @Anonymous.
 *
 * @example
 * @Secured()                    // any authenticated user
 * @Secured('ADMIN')             // requires ADMIN role
 * @Secured(['ADMIN', 'EDITOR']) // requires ADMIN or EDITOR
 *
 * Order `-95` ensures security runs early — before validation (-90) and before
 * business logic interceptors like @Log (0), @Cacheable (0), etc.
 */
export const Secured = createAopDecorator<{
  interceptor: SecurityInterceptor;
  order: -95;
  argMapping: ['roles'];
  args: [roles?: string | string[]];
}>();
