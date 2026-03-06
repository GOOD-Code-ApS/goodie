import type { InvocationContext } from '@goodie-ts/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/logger.js';
import { ConsoleLogger } from '../src/logger.js';
import { LoggerFactory } from '../src/logger-factory.js';
import { LoggingInterceptor } from '../src/logging-interceptor.js';

afterEach(() => {
  LoggerFactory.reset();
});

describe('LoggerFactory', () => {
  it('should return a logger that delegates to ConsoleLogger by default', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = LoggerFactory.getLogger('MyService');

    logger.info('hello');

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain('[MyService]');
    expect(logSpy.mock.calls[0][0]).toContain('hello');
    logSpy.mockRestore();
  });

  it('should accept a class as target and use its name', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    class OrderService {}
    const logger = LoggerFactory.getLogger(OrderService);

    logger.info('test');

    expect(logSpy.mock.calls[0][0]).toContain('[OrderService]');
    logSpy.mockRestore();
  });

  it('should swap backing implementation via setFactory()', () => {
    const calls: string[] = [];
    const customLogger: Logger = {
      debug: (msg) => calls.push(msg),
      info: (msg) => calls.push(msg),
      warn: (msg) => calls.push(msg),
      error: (msg) => calls.push(msg),
    };

    LoggerFactory.setFactory(() => customLogger);
    const logger = LoggerFactory.getLogger('Test');

    logger.info('hello');
    expect(calls).toEqual(['hello']);
  });

  it('should retroactively affect loggers obtained before setFactory()', () => {
    // Obtain a logger BEFORE swapping the factory
    const logger = LoggerFactory.getLogger('EarlyService');

    // Swap to a custom factory
    const calls: string[] = [];
    LoggerFactory.setFactory(() => ({
      debug: (msg) => calls.push(msg),
      info: (msg) => calls.push(msg),
      warn: (msg) => calls.push(msg),
      error: (msg) => calls.push(msg),
    }));

    // The previously obtained delegate should now use the new factory
    logger.info('after swap');
    expect(calls).toEqual(['after swap']);
  });

  it('should cache resolved loggers within the same factory', () => {
    const factorySpy = vi.fn((name: string) => new ConsoleLogger(name));
    LoggerFactory.setFactory(factorySpy);

    const logger = LoggerFactory.getLogger('CacheTest');
    logger.info('first');
    logger.info('second');

    // Factory should only be called once — resolved logger is cached
    expect(factorySpy).toHaveBeenCalledOnce();
    expect(factorySpy).toHaveBeenCalledWith('CacheTest');
  });

  it('should clear resolved cache when setFactory() is called', () => {
    const firstFactorySpy = vi.fn((name: string) => new ConsoleLogger(name));
    const secondFactorySpy = vi.fn((name: string) => new ConsoleLogger(name));

    LoggerFactory.setFactory(firstFactorySpy);
    const logger = LoggerFactory.getLogger('ClearTest');
    logger.info('before');
    expect(firstFactorySpy).toHaveBeenCalledOnce();

    LoggerFactory.setFactory(secondFactorySpy);
    logger.info('after');
    expect(secondFactorySpy).toHaveBeenCalledOnce();
  });

  it('should share resolved loggers between LoggingInterceptor and static getLogger()', () => {
    const factorySpy = vi.fn((name: string) => new ConsoleLogger(name));
    LoggerFactory.setFactory(factorySpy);

    // Get a logger statically (triggers resolve for 'TestService')
    const staticLogger = LoggerFactory.getLogger('TestService');
    staticLogger.info('static call');

    // LoggingInterceptor with default factory also delegates to LoggerFactory
    const interceptor = new LoggingInterceptor();
    const ctx: InvocationContext = {
      className: 'TestService',
      methodName: 'doWork',
      args: [],
      target: {},
      proceed: () => 'result',
    };
    interceptor.intercept(ctx);

    // Factory should have been called only once for 'TestService' — shared resolved cache
    const testServiceCalls = factorySpy.mock.calls.filter(
      ([name]) => name === 'TestService',
    );
    expect(testServiceCalls).toHaveLength(1);
  });
});
