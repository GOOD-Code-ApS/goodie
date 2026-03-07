import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import { UnauthorizedError } from './errors.js';
import type { SecurityContext } from './security-context.js';

/**
 * AOP interceptor that enforces `@Secured` on methods.
 *
 * Checks the `SecurityContext` for an authenticated principal.
 * If none is present, throws `UnauthorizedError`.
 *
 * Wired automatically by the `@Secured` decorator via `createAopDecorator`.
 */
@Singleton()
export class SecurityInterceptor implements MethodInterceptor {
  constructor(private readonly securityContext: SecurityContext) {}

  intercept(ctx: InvocationContext): unknown {
    const principal = this.securityContext.getPrincipal();
    if (!principal) {
      throw new UnauthorizedError();
    }
    return ctx.proceed();
  }
}
