import { describe, expect, it } from 'vitest';
import { HealthAggregator } from '../src/health-aggregator.js';
import type { HealthIndicator } from '../src/health-indicator.js';

function indicator(
  name: string,
  status: 'UP' | 'DOWN',
  details?: Record<string, unknown>,
): HealthIndicator {
  return {
    name,
    check: async () => ({ status, details }),
  };
}

describe('HealthAggregator', () => {
  it('should return UP when all indicators are UP', async () => {
    const aggregator = new HealthAggregator([
      indicator('db', 'UP'),
      indicator('cache', 'UP'),
    ]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('UP');
    expect(result.indicators.db.status).toBe('UP');
    expect(result.indicators.cache.status).toBe('UP');
  });

  it('should return DOWN when any indicator is DOWN', async () => {
    const aggregator = new HealthAggregator([
      indicator('db', 'UP'),
      indicator('cache', 'DOWN'),
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
      indicator('db', 'UP', { connections: 5, maxConnections: 20 }),
    ]);

    const result = await aggregator.checkAll();

    expect(result.indicators.db.details).toEqual({
      connections: 5,
      maxConnections: 20,
    });
  });

  it('should handle indicator check() rejection as DOWN with indicator name', async () => {
    const failing: HealthIndicator = {
      name: 'redis',
      check: async () => {
        throw new Error('Connection refused');
      },
    };

    const aggregator = new HealthAggregator([indicator('db', 'UP'), failing]);

    const result = await aggregator.checkAll();

    expect(result.status).toBe('DOWN');
    expect(result.indicators.db.status).toBe('UP');
    expect(result.indicators.redis.status).toBe('DOWN');
    expect(result.indicators.redis.details?.error).toBe('Connection refused');
    expect(result.indicators.redis.details?.errorType).toBe('Error');
  });

  it('should preserve all indicator names when multiple rejections occur', async () => {
    const failingRedis: HealthIndicator = {
      name: 'redis',
      check: async () => {
        throw new Error('Redis down');
      },
    };
    const failingKafka: HealthIndicator = {
      name: 'kafka',
      check: async () => {
        throw new TypeError('Kafka timeout');
      },
    };

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
    const slow: HealthIndicator = {
      name: 'slow',
      check: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { status: 'UP' };
      },
    };

    const aggregator = new HealthAggregator([slow, slow, slow]);
    await aggregator.checkAll();

    const elapsed = Date.now() - startTime;
    // If sequential, would be ~150ms. Concurrent should be ~50ms.
    expect(elapsed).toBeLessThan(120);
  });
});
