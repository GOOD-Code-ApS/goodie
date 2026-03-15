import type {
  ApplicationContext,
  ComponentDefinition,
  InjectionToken,
} from '@goodie-ts/core';
import { Response } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import { InfoEndpoint } from '../src/info-endpoint.js';

function createMockContext(
  config: Record<string, unknown>,
): ApplicationContext {
  const configToken = {
    description: '__Goodie_Config',
  } as InjectionToken<Record<string, unknown>>;

  const configDef: ComponentDefinition = {
    token: configToken,
    scope: 'singleton',
    dependencies: [],
    factory: () => config,
    eager: false,
    metadata: {},
  } as ComponentDefinition;

  return {
    getDefinitions: vi.fn().mockReturnValue([configDef]),
  } as unknown as ApplicationContext;
}

describe('InfoEndpoint', () => {
  it('returns info properties as nested object', () => {
    const ctx = createMockContext({
      'info.app.name': 'my-app',
      'info.app.version': '1.2.0',
      'server.port': 3000,
    });

    const endpoint = new InfoEndpoint(ctx);
    const result = endpoint.info();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);

    const body = result.body as Record<string, unknown>;
    expect(body).toEqual({
      app: {
        name: 'my-app',
        version: '1.2.0',
      },
    });
  });

  it('ignores non-info properties', () => {
    const ctx = createMockContext({
      'server.port': 3000,
      'datasource.url': 'postgres://localhost',
    });

    const endpoint = new InfoEndpoint(ctx);
    const result = endpoint.info();

    const body = result.body as Record<string, unknown>;
    expect(body).toEqual({});
  });

  it('handles deeply nested info properties', () => {
    const ctx = createMockContext({
      'info.build.time': '2026-03-09T12:00:00Z',
      'info.git.commit': 'abc1234',
      'info.git.branch': 'main',
    });

    const endpoint = new InfoEndpoint(ctx);
    const result = endpoint.info();

    const body = result.body as Record<string, unknown>;
    expect(body).toEqual({
      build: { time: '2026-03-09T12:00:00Z' },
      git: { commit: 'abc1234', branch: 'main' },
    });
  });

  it('returns empty object when no info properties exist', () => {
    const ctx = createMockContext({
      'server.port': 3000,
    });

    const endpoint = new InfoEndpoint(ctx);
    const result = endpoint.info();

    const body = result.body as Record<string, unknown>;
    expect(body).toEqual({});
  });

  it('handles single-level info key', () => {
    const ctx = createMockContext({
      'info.environment': 'production',
    });

    const endpoint = new InfoEndpoint(ctx);
    const result = endpoint.info();

    const body = result.body as Record<string, unknown>;
    expect(body).toEqual({ environment: 'production' });
  });
});
