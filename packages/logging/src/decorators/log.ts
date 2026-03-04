import { createAopDecorator } from '@goodie-ts/aop';
import type { LoggingInterceptor } from '../logging-interceptor.js';

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

/**
 * Mark a method for automatic logging of entry/exit.
 *
 * At compile time, the transformer's AOP scanner reads the type parameter
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
export const Log = createAopDecorator<{
  interceptor: LoggingInterceptor;
  order: -100;
  args: [opts?: LogOptions];
}>();
