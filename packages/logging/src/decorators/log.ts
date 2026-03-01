export interface LogOptions {
  /** Log level for the method. Default: 'info'. */
  level?: 'debug' | 'info';
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Mark a method for automatic logging of entry/exit.
 *
 * At compile time, the logging transformer plugin reads this decorator
 * and wires the `LoggingInterceptor` via AOP. No runtime metadata is stored.
 *
 * @param opts - Optional configuration (e.g. log level).
 */
export function Log(_opts?: LogOptions): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: decorator arguments are read at compile time by the logging transformer plugin
  };
}
