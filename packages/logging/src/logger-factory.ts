import type { Logger } from './logger.js';
import { ConsoleLogger } from './logger.js';

/**
 * Static factory for obtaining Logger instances.
 *
 * Primary logging API — use `LoggerFactory.getLogger(MyClass)` for imperative logging.
 * The `@Log()` decorator / `LoggingInterceptor` delegates here too, so AOP loggers
 * and static loggers share the same instances and backing implementation.
 *
 * Returns a lightweight delegate that resolves the real logger on each call,
 * so `setFactory()` retroactively affects all previously obtained loggers.
 * This makes `private static readonly log = LoggerFactory.getLogger(MyClass)`
 * safe regardless of import/bootstrap ordering.
 *
 * Call `setFactory()` to swap the backing implementation (e.g. pino, winston).
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional — mirrors SLF4J LoggerFactory API
export class LoggerFactory {
  private static factory: (name: string) => Logger = (name) =>
    new ConsoleLogger(name);
  private static readonly resolved = new Map<string, Logger>();

  /**
   * Returns a delegate Logger for the given class or name.
   * The delegate lazily resolves the real logger on each call,
   * so swapping the factory via `setFactory()` takes effect immediately.
   */
  static getLogger(target: string | { name: string }): Logger {
    const name = typeof target === 'string' ? target : target.name;
    return {
      debug: (msg, meta) => LoggerFactory.resolve(name).debug(msg, meta),
      info: (msg, meta) => LoggerFactory.resolve(name).info(msg, meta),
      warn: (msg, meta) => LoggerFactory.resolve(name).warn(msg, meta),
      error: (msg, meta) => LoggerFactory.resolve(name).error(msg, meta),
    };
  }

  /**
   * Swaps the backing logger implementation.
   * Clears the resolved cache so subsequent log calls use the new factory.
   */
  static setFactory(factory: (name: string) => Logger): void {
    LoggerFactory.factory = factory;
    LoggerFactory.resolved.clear();
  }

  /** @internal — reset to default state (for testing) */
  static reset(): void {
    LoggerFactory.factory = (name) => new ConsoleLogger(name);
    LoggerFactory.resolved.clear();
  }

  private static resolve(name: string): Logger {
    let logger = LoggerFactory.resolved.get(name);
    if (!logger) {
      logger = LoggerFactory.factory(name);
      LoggerFactory.resolved.set(name, logger);
    }
    return logger;
  }
}
