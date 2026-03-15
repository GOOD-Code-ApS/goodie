import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import { ForbiddenError, UnauthorizedError } from './errors.js';
import { SecurityContext } from './security-context.js';

/**
 * AOP interceptor for @Secured methods.
 *
 * Reads the required roles from invocation metadata (set by the @Secured decorator
 * via the transformer's AOP scanner). Checks the current principal from
 * SecurityContext. Throws UnauthorizedError if no principal, ForbiddenError
 * if the principal lacks required roles.
 *
 * Works on both controller methods and regular @Singleton component methods.
 */
@Singleton()
export class SecurityInterceptor implements MethodInterceptor {
  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    // @Anonymous methods skip all security checks
    if (ctx.metadata?.anonymous === true) {
      return ctx.proceed();
    }

    const principal = SecurityContext.current();

    if (!principal) {
      throw new UnauthorizedError();
    }

    const roles = resolveRoles(ctx.metadata?.roles);
    if (roles.length > 0) {
      const hasRole = roles.some((role) => principal.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenError(`Required role(s): ${roles.join(', ')}`);
      }
    }

    return ctx.proceed();
  }
}

function resolveRoles(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === 'string');
  return [];
}
