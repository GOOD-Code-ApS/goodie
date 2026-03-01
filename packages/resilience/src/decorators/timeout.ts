type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Mark a method for automatic timeout.
 *
 * At compile time, the resilience transformer plugin reads this decorator
 * and wires the `TimeoutInterceptor` via AOP.
 *
 * @param duration - Timeout duration in milliseconds.
 */
export function Timeout(_duration: number): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: read at compile time by the resilience transformer plugin
  };
}
