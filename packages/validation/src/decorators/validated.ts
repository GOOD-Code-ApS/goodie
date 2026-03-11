import { createAopDecorator } from '@goodie-ts/core';
import type { ValidationInterceptor } from '../validation-interceptor.js';

/**
 * @Validated — triggers validation of method parameters via AOP.
 *
 * Can be applied at method level (validate that method's params)
 * or class level (validate all methods' params).
 *
 * The transformer wires `ValidationInterceptor` with `paramTypes`
 * metadata — the interceptor looks up schemas at runtime via
 * `ValiSchemaFactory`.
 *
 * Order `-90` ensures validation runs early in the interceptor chain,
 * before business logic interceptors like `@Log` (0), `@Cacheable` (0),
 * `@Retryable` (10), etc. Invalid input is rejected before any
 * side-effecting interceptors execute.
 */
export const Validated = createAopDecorator<{
  interceptor: ValidationInterceptor;
  order: -90;
}>();
