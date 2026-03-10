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
 */
export const Validated = createAopDecorator<{
  interceptor: ValidationInterceptor;
  order: -90;
}>();
