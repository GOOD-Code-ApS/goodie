import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';
import { ConsoleLogger } from './logger.js';
import { MDC } from './mdc.js';

/**
 * Method interceptor that logs entry/exit of intercepted methods.
 * Reads the log level from invocation metadata (set by the @Log decorator via the transformer plugin).
 * Automatically includes MDC context (e.g. traceId) in log output.
 */
export class LoggingInterceptor implements MethodInterceptor {
  private readonly loggers = new Map<string, ConsoleLogger>();

  intercept(ctx: InvocationContext): unknown | Promise<unknown> {
    const level =
      (ctx.metadata?.level as 'debug' | 'info' | undefined) ?? 'info';
    const logger = this.getLogger(ctx.className);
    const mdcContext = MDC.getAll();
    const meta: Record<string, unknown> = {
      ...mdcContext,
      method: ctx.methodName,
      args: ctx.args,
    };

    logger[level](`→ ${ctx.methodName}()`, meta);

    const start = performance.now();

    try {
      const result = ctx.proceed();

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            const ms = (performance.now() - start).toFixed(1);
            logger[level](`← ${ctx.methodName}() [${ms}ms]`, mdcContext);
            return value;
          },
          (error) => {
            const ms = (performance.now() - start).toFixed(1);
            logger.error(`✗ ${ctx.methodName}() [${ms}ms]`, {
              ...mdcContext,
              error: String(error),
            });
            throw error;
          },
        );
      }

      const ms = (performance.now() - start).toFixed(1);
      logger[level](`← ${ctx.methodName}() [${ms}ms]`, mdcContext);
      return result;
    } catch (error) {
      const ms = (performance.now() - start).toFixed(1);
      logger.error(`✗ ${ctx.methodName}() [${ms}ms]`, {
        ...mdcContext,
        error: String(error),
      });
      throw error;
    }
  }

  private getLogger(className: string): ConsoleLogger {
    let logger = this.loggers.get(className);
    if (!logger) {
      logger = new ConsoleLogger(className);
      this.loggers.set(className, logger);
    }
    return logger;
  }
}
