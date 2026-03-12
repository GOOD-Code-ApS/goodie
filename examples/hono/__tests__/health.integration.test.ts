import { createHonoRouter } from '@goodie-ts/hono';
import { TransactionManager } from '@goodie-ts/kysely';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { buildDefinitions } from '../src/AppContext.generated.js';

describe('Health API', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  const test = createGoodieTest(buildDefinitions, {
    config: () => ({
      'datasource.url': container.getConnectionUri(),
      'datasource.dialect': 'postgres',
    }),
    fixtures: {
      app: (ctx) => createHonoRouter(ctx),
    },
    transactional: TransactionManager,
  });

  test('GET /health returns UP with indicators', async ({ app }) => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.indicators).toBeDefined();
    expect(body.indicators.uptime.status).toBe('UP');
    expect(body.indicators.uptime.details.uptimeMs).toBeGreaterThan(0);
    expect(body.indicators.database.status).toBe('UP');
  });

  test('GET /health includes database indicator with live connection', async ({
    app,
  }) => {
    const res = await app.request('/health');

    const body = await res.json();
    expect(body.indicators.database).toEqual({ status: 'UP' });
  });
});
