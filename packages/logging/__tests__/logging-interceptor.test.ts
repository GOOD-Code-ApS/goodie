import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/logger.js';
import { LoggingInterceptor } from '../src/logging-interceptor.js';
import { MDC } from '../src/mdc.js';

function createContext(
  overrides?: Partial<InvocationContext>,
): InvocationContext {
  return {
    className: 'TestService',
    methodName: 'doWork',
    args: ['arg1', 42],
    target: {},
    proceed: () => 'result',
    ...overrides,
  };
}

describe('LoggingInterceptor', () => {
  it('should log method entry and exit for sync methods', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    const result = interceptor.intercept(createContext());

    expect(result).toBe('result');
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toContain('→ doWork()');
    expect(logSpy.mock.calls[1][0]).toContain('← doWork()');
    logSpy.mockRestore();
  });

  it('should log method entry and exit for async methods', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    const ctx = createContext({
      proceed: () => Promise.resolve('async-result'),
    });
    const result = await interceptor.intercept(ctx);

    expect(result).toBe('async-result');
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toContain('→ doWork()');
    expect(logSpy.mock.calls[1][0]).toContain('← doWork()');
    logSpy.mockRestore();
  });

  it('should log errors for sync methods', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    const ctx = createContext({
      proceed: () => {
        throw new Error('sync failure');
      },
    });

    expect(() => interceptor.intercept(ctx)).toThrow('sync failure');
    expect(logSpy).toHaveBeenCalledOnce(); // entry log
    expect(errorSpy).toHaveBeenCalledOnce(); // error log
    expect(errorSpy.mock.calls[0][0]).toContain('✗ doWork()');
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should log errors for async methods', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    const ctx = createContext({
      proceed: () => Promise.reject(new Error('async failure')),
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow('async failure');
    expect(logSpy).toHaveBeenCalledOnce(); // entry log
    expect(errorSpy).toHaveBeenCalledOnce(); // error log
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should respect debug level from metadata', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    const ctx = createContext({ metadata: { level: 'debug' } });
    interceptor.intercept(ctx);

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toContain('DEBUG');
    logSpy.mockRestore();
  });

  it('should default to info level when no metadata', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    interceptor.intercept(createContext());

    expect(logSpy.mock.calls[0][0]).toContain('INFO');
    logSpy.mockRestore();
  });

  it('should include MDC context in log output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    MDC.run(new Map([['traceId', 'trace-abc']]), () => {
      interceptor.intercept(createContext());
    });

    expect(logSpy.mock.calls[0][0]).toContain('trace-abc');
    logSpy.mockRestore();
  });

  it('should include execution time in exit log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    interceptor.intercept(createContext());

    // Exit log should contain [Xms]
    expect(logSpy.mock.calls[1][0]).toMatch(/\[\d+\.\d+ms\]/);
    logSpy.mockRestore();
  });

  it('should use custom logger factory when provided', () => {
    const messages: string[] = [];
    const customLogger: Logger = {
      debug: (msg) => messages.push(`DEBUG: ${msg}`),
      info: (msg) => messages.push(`INFO: ${msg}`),
      warn: (msg) => messages.push(`WARN: ${msg}`),
      error: (msg) => messages.push(`ERROR: ${msg}`),
    };

    const interceptor = new LoggingInterceptor(() => customLogger);
    interceptor.intercept(createContext());

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('→ doWork()');
    expect(messages[1]).toContain('← doWork()');
  });

  it('should capture fresh MDC context at async exit (not stale snapshot)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const interceptor = new LoggingInterceptor();

    await MDC.run(new Map([['traceId', 'trace-123']]), async () => {
      const ctx = createContext({
        proceed: async () => {
          MDC.put('spanId', 'span-456');
          return 'done';
        },
      });
      await interceptor.intercept(ctx);
    });

    // Exit log should include the spanId added during execution
    const exitLog = logSpy.mock.calls[1][0];
    expect(exitLog).toContain('span-456');
    logSpy.mockRestore();
  });
});
