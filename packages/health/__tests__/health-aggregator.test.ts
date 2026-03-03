import { describe, expect, it, vi } from 'vitest';
import { HealthAggregator } from '../src/health-aggregator.js';
import type { HealthResult } from '../src/health-indicator.js';
import { HealthIndicator } from '../src/health-indicator.js';

class TestIndicator extends HealthIndicator {
  constructor(
    readonly name: string,
    private readonly status: 'UP' | 'DOWN',
    private readonly details?: Record<string, unknown>,
  ) {
    super();
  }

  async check(): Promise<HealthResult> {
    return { status: this.status, details: this.details };
  }
}

describe('HealthAggregator', () => {
  it('should return UP when all indicators are UP', async () => {
    const aggregator = new HealthAggregator([
      new TestIndicator('db', 'UP'),
      new TestIndicator('cache', 'UP'),
    ]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('UP');
    expect(result.indicators.db.status).toBe('UP');
    expect(result.indicators.cache.status).toBe('UP');
  });

  it('should return DOWN when any indicator is DOWN', async () => {
    const aggregator = new HealthAggregator([
      new TestIndicator('db', 'UP'),
      new TestIndicator('cache', 'DOWN'),
    ]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('DOWN');
    expect(result.indicators.db.status).toBe('UP');
    expect(result.indicators.cache.status).toBe('DOWN');
  });

  it('should return UP with empty indicators', async () => {
    const aggregator = new HealthAggregator([]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('UP');
    expect(result.indicators).toEqual({});
  });

  it('should include details from indicators', async () => {
    const aggregator = new HealthAggregator([
      new TestIndicator('db', 'UP', { connections: 5, maxConnections: 20 }),
    ]);

    const result = await aggregator.checkAll();

    expect(result.indicators.db.details).toEqual({
      connections: 5,
      maxConnections: 20,
    });
  });

  it('should handle indicator check() rejection as DOWN with indicator name', async () => {
    const failing = new (class extends HealthIndicator {
      readonly name = 'redis';
      async check(): Promise<HealthResult> {
        throw new Error('Connection refused');
      }
    })();

    const aggregator = new HealthAggregator([
      new TestIndicator('db', 'UP'),
      failing,
    ]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('DOWN');
    expect(result.indicators.db.status).toBe('UP');
    expect(result.indicators.redis.status).toBe('DOWN');
    expect(result.indicators.redis.details?.error).toBe('Connection refused');
    expect(result.indicators.redis.details?.errorType).toBe('Error');
  });

  it('should preserve all indicator names when multiple rejections occur', async () => {
    const failingRedis = new (class extends HealthIndicator {
      readonly name = 'redis';
      async check(): Promise<HealthResult> {
        throw new Error('Redis down');
      }
    })();
    const failingKafka = new (class extends HealthIndicator {
      readonly name = 'kafka';
      async check(): Promise<HealthResult> {
        throw new TypeError('Kafka timeout');
      }
    })();

    const aggregator = new HealthAggregator([failingRedis, failingKafka]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('DOWN');
    expect(result.indicators.redis.status).toBe('DOWN');
    expect(result.indicators.redis.details?.error).toBe('Redis down');
    expect(result.indicators.redis.details?.errorType).toBe('Error');
    expect(result.indicators.kafka.status).toBe('DOWN');
    expect(result.indicators.kafka.details?.error).toBe('Kafka timeout');
    expect(result.indicators.kafka.details?.errorType).toBe('TypeError');
  });

  it('should run all checks concurrently', async () => {
    const startTime = Date.now();

    class SlowIndicator extends HealthIndicator {
      constructor(readonly name: string) {
        super();
      }
      async check(): Promise<HealthResult> {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { status: 'UP' };
      }
    }

    const aggregator = new HealthAggregator([
      new SlowIndicator('slow-a'),
      new SlowIndicator('slow-b'),
      new SlowIndicator('slow-c'),
    ]);
    const result = await aggregator.checkAll();

    const elapsed = Date.now() - startTime;
    // If sequential, would be ~150ms. Concurrent should be ~50ms.
    // Use generous threshold to avoid flakiness in CI.
    expect(elapsed).toBeLessThan(140);
    expect(Object.keys(result.indicators)).toHaveLength(3);
  });

  it('should warn on duplicate indicator names at construction time', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dup = new TestIndicator('db', 'UP');

    new HealthAggregator([dup, dup]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Duplicate indicator name 'db'"),
    );
    warnSpy.mockRestore();
  });
});
