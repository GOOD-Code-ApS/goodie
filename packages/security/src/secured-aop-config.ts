/**
 * Internal AOP scanner discovery file.
 *
 * The `const Secured = createAopDecorator<{...}>()` pattern is scanned at
 * library build time by the transformer's AOP scanner. It extracts the type
 * parameter and writes the `Secured → SecurityInterceptor` mapping into
 * `beans.json`'s `aop` section.
 *
 * The actual runtime `@Secured()` decorator lives in `secured.ts` — it stores
 * `Symbol.metadata` for the `SecurityHttpFilter`. Both coexist: compile-time
 * AOP wiring from this file, runtime metadata from `secured.ts`.
 *
 * This file is NOT exported from the package index.
 */
import { createAopDecorator } from '@goodie-ts/core';
import type { SecurityInterceptor } from './security-interceptor.js';

export const Secured = createAopDecorator<{
  interceptor: SecurityInterceptor;
  order: -900;
}>();
