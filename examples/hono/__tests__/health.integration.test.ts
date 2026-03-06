import type { ApplicationContext } from '@goodie-ts/core';
import { TransactionManager } from '@goodie-ts/kysely';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { buildDefinitions, createRouter } from '../src/AppContext.generated.js';

describe('Health API', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  const test = createGoodieTest(buildDefinitions(), {
    config: () => ({
      'datasource.url': container.getConnectionUri(),
      'datasource.dialect': 'postgres',
    }),
    transactional: TransactionManager,
  });

  function app(ctx: ApplicationContext): Hono {
    return createRouter(ctx);
  }

  test('GET /health returns UP with indicators', async ({ ctx }) => {
    const honoApp = app(ctx);

    const res = await honoApp.request('/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.indicators).toBeDefined();
    expect(body.indicators.uptime.status).toBe('UP');
    expect(body.indicators.uptime.details.uptimeMs).toBeGreaterThan(0);
    expect(body.indicators.database.status).toBe('UP');
  });

  test('GET /health includes database indicator with live connection', async ({
    ctx,
  }) => {
    const honoApp = app(ctx);

    const res = await honoApp.request('/health');

    const body = await res.json();
    expect(body.indicators.database).toEqual({ status: 'UP' });
  });
});
