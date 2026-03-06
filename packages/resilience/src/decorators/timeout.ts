import { createAopDecorator } from '@goodie-ts/core';
import type { TimeoutInterceptor } from '../timeout-interceptor.js';

/**
 * Mark a method for automatic timeout.
 *
 * At compile time, the AOP scanner reads the type parameter
 * and wires the `TimeoutInterceptor` via AOP.
 *
 * @param duration - Timeout duration in milliseconds.
 */
export const Timeout = createAopDecorator<{
  interceptor: TimeoutInterceptor;
  order: -30;
  argMapping: ['duration'];
  defaults: { duration: 5000 };
  args: [duration: number];
}>();
