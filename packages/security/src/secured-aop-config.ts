/**
 * Internal AOP scanner discovery file.
 *
 * The `const Secured = createAopDecorator<{...}>()` pattern is scanned at
 * library build time by the transformer's AOP scanner. It extracts the type
 * parameter and writes the `Secured → SecurityInterceptor` mapping into
 * `beans.json`'s `aop` section.
 *
 * The actual `@Secured()` decorator lives in `secured.ts` — it's a compile-time
 * no-op. The `SecurityHttpFilter` reads `DecoratorMetadata` (class/method
 * decorators) from `HttpFilterContext` to enforce auth on controllers.
 *
 * On `@Controller` classes, both the `SecurityHttpFilter` (middleware) and
 * `SecurityInterceptor` (AOP) are wired. The interceptor detects that the
 * filter already handled auth via `SecurityContext` and becomes a no-op.
 *
 * This file is NOT exported from the package index.
 */
import { createAopDecorator } from '@goodie-ts/core';
import type { SecurityInterceptor } from './security-interceptor.js';

export const Secured = createAopDecorator<{
  interceptor: SecurityInterceptor;
  order: -900;
}>();
