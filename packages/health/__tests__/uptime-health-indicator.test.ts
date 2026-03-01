import { describe, expect, it } from 'vitest';
import { UptimeHealthIndicator } from '../src/uptime-health-indicator.js';

describe('UptimeHealthIndicator', () => {
  it('should always return UP', async () => {
    const indicator = new UptimeHealthIndicator();
    const result = await indicator.check();

    expect(result.status).toBe('UP');
  });

  it('should have name "uptime"', () => {
    const indicator = new UptimeHealthIndicator();
    expect(indicator.name).toBe('uptime');
  });

  it('should include uptimeMs in details', async () => {
    const indicator = new UptimeHealthIndicator();
    const result = await indicator.check();

    expect(result.details).toBeDefined();
    expect(typeof result.details?.uptimeMs).toBe('number');
    expect(result.details?.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should include startedAt ISO string in details', async () => {
    const indicator = new UptimeHealthIndicator();
    const result = await indicator.check();

    expect(result.details?.startedAt).toBeDefined();
    expect(typeof result.details?.startedAt).toBe('string');
    // Verify it's a valid ISO date
    expect(
      new Date(result.details?.startedAt as string).getTime(),
    ).not.toBeNaN();
  });
});
