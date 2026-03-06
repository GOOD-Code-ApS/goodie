import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import type { Logger } from './logger.js';
import { LoggerFactory } from './logger-factory.js';
import { MDC } from './mdc.js';

/**
 * Method interceptor that logs entry/exit of intercepted methods.
 * Reads the log level from invocation metadata (set by the @Log decorator via the transformer plugin).
 * Automatically includes MDC context (e.g. traceId) in log output.
 *
 * Uses `LoggerFactory.getLogger()` for logger resolution. To customize the
 * logger backend (pino, winston, etc.), call `LoggerFactory.setFactory()` at
 * application startup.
 */
@Singleton()
export class LoggingInterceptor implements MethodInterceptor {
  private readonly loggers = new Map<string, Logger>();

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const level =
      (ctx.metadata?.level as 'debug' | 'info' | undefined) ?? 'info';
    const logArgs = (ctx.metadata?.logArgs as boolean | undefined) ?? false;
    const logger = this.getLogger(ctx.className);
    const mdcContext = MDC.getAll();
    const meta: Record<string, unknown> = {
      ...mdcContext,
      method: ctx.methodName,
      ...(logArgs ? { args: ctx.args } : {}),
    };

    logger[level](`→ ${ctx.methodName}()`, meta);

    const start = performance.now();

    try {
      const result = ctx.proceed();

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            const ms = (performance.now() - start).toFixed(1);
            logger[level](`← ${ctx.methodName}() [${ms}ms]`, MDC.getAll());
            return value;
          },
          (error) => {
            const ms = (performance.now() - start).toFixed(1);
            logger.error(`✗ ${ctx.methodName}() [${ms}ms]`, {
              ...MDC.getAll(),
              error: String(error),
            });
            throw error;
          },
        );
      }

      const ms = (performance.now() - start).toFixed(1);
      logger[level](`← ${ctx.methodName}() [${ms}ms]`, MDC.getAll());
      return result;
    } catch (error) {
      const ms = (performance.now() - start).toFixed(1);
      logger.error(`✗ ${ctx.methodName}() [${ms}ms]`, {
        ...MDC.getAll(),
        error: String(error),
      });
      throw error;
    }
  }

  private getLogger(className: string): Logger {
    let logger = this.loggers.get(className);
    if (!logger) {
      logger = LoggerFactory.getLogger(className);
      this.loggers.set(className, logger);
    }
    return logger;
  }
}
