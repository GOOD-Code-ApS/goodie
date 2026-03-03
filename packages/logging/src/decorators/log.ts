export interface LogOptions {
  /** Log level for the method. Default: 'info'. */
  level?: 'debug' | 'info';
  /**
   * Whether to include method arguments in the log output.
   * Default: `false` — arguments are **not** logged to avoid leaking
   * sensitive data (PII, passwords, tokens, etc.).
   * Set to `true` only when you are certain the arguments are safe to log.
   */
  logArgs?: boolean;
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
 * **Limitation:** `@Log` on a `@Provides` method inside a `@Module` class is
 * silently ignored. `@Provides` methods are factory functions executed by the
 * container at bean creation time — they are not instance methods that go
 * through AOP interception. Use `@Log` only on regular `@Singleton` /
 * `@Injectable` class methods.
 *
 * @param opts - Optional configuration (e.g. log level, argument logging).
 */
export function Log(_opts?: LogOptions): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: decorator arguments are read at compile time by the logging transformer plugin
  };
}
