import { Response } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import type {
  AggregatedHealth,
  HealthAggregator,
} from '../src/health-aggregator.js';
import { HealthController } from '../src/health-controller.js';

function createMockAggregator(result: AggregatedHealth): HealthAggregator {
  return {
    checkAll: vi.fn().mockResolvedValue(result),
  } as unknown as HealthAggregator;
}

describe('HealthController', () => {
  it('returns 200 when all indicators are UP', async () => {
    const health: AggregatedHealth = {
      status: 'UP',
      indicators: {
        uptime: { status: 'UP', details: { uptimeMs: 1000 } },
        database: { status: 'UP' },
      },
    };
    const controller = new HealthController(createMockAggregator(health));

    const result = await controller.check();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(health);
  });

  it('returns 503 when any indicator is DOWN', async () => {
    const health: AggregatedHealth = {
      status: 'DOWN',
      indicators: {
        uptime: { status: 'UP' },
        database: { status: 'DOWN', details: { error: 'Connection refused' } },
      },
    };
    const controller = new HealthController(createMockAggregator(health));

    const result = await controller.check();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(503);
    expect(result.body).toEqual(health);
  });

  it('delegates to HealthAggregator.checkAll()', async () => {
    const health: AggregatedHealth = { status: 'UP', indicators: {} };
    const aggregator = createMockAggregator(health);
    const controller = new HealthController(aggregator);

    await controller.check();

    expect(aggregator.checkAll).toHaveBeenCalledOnce();
  });
});
