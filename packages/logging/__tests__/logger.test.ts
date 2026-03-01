import { describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from '../src/logger.js';

describe('ConsoleLogger', () => {
  it('should log info messages to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.info('hello world');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('INFO');
    expect(spy.mock.calls[0][0]).toContain('[TestService]');
    expect(spy.mock.calls[0][0]).toContain('hello world');
    spy.mockRestore();
  });

  it('should log debug messages to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.debug('debug msg');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('DEBUG');
    spy.mockRestore();
  });

  it('should log warn messages to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.warn('warning');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('WARN');
    spy.mockRestore();
  });

  it('should log error messages to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.error('failure');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('ERROR');
    spy.mockRestore();
  });

  it('should include metadata in log output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.info('with meta', { userId: '123', action: 'login' });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('"userId":"123"');
    expect(spy.mock.calls[0][0]).toContain('"action":"login"');
    spy.mockRestore();
  });

  it('should include timestamp in log output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleLogger('TestService');

    logger.info('timed');

    // ISO timestamp format: 2026-03-01T...
    expect(spy.mock.calls[0][0]).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    spy.mockRestore();
  });
});
