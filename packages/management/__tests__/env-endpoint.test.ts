import type {
  ApplicationContext,
  ComponentDefinition,
  InjectionToken,
} from '@goodie-ts/core';
import { Response } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import { EnvEndpoint } from '../src/env-endpoint.js';

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

function createEmptyContext(): ApplicationContext {
  return {
    getDefinitions: vi.fn().mockReturnValue([]),
  } as unknown as ApplicationContext;
}

describe('EnvEndpoint', () => {
  it('returns config properties', () => {
    const ctx = createMockContext({
      'server.host': 'localhost',
      'server.port': 3000,
      'datasource.dialect': 'postgres',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['server.host']).toBe('localhost');
    expect(body.properties['server.port']).toBe(3000);
    expect(body.properties['datasource.dialect']).toBe('postgres');
  });

  it('masks values with "password" in key', () => {
    const ctx = createMockContext({
      'datasource.password': 'super-secret-123',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['datasource.password']).toBe('******');
  });

  it('masks values with "secret" in key', () => {
    const ctx = createMockContext({
      'jwt.secret': 'my-jwt-secret',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['jwt.secret']).toBe('******');
  });

  it('masks values with "token" in key', () => {
    const ctx = createMockContext({
      'auth.token': 'bearer-xyz',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['auth.token']).toBe('******');
  });

  it('masks values with "credential" in key', () => {
    const ctx = createMockContext({
      'aws.credential': 'AKIAIOSFODNN7EXAMPLE',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['aws.credential']).toBe('******');
  });

  it('masks values with "certificate" in key', () => {
    const ctx = createMockContext({
      'tls.certificate': 'PEM-data...',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['tls.certificate']).toBe('******');
  });

  it('masks values with "key" in key', () => {
    const ctx = createMockContext({
      'api.key': 'sk-12345',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['api.key']).toBe('******');
  });

  it('is case-insensitive when masking', () => {
    const ctx = createMockContext({
      DB_PASSWORD: 'hidden',
      JWT_SECRET: 'hidden',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties.DB_PASSWORD).toBe('******');
    expect(body.properties.JWT_SECRET).toBe('******');
  });

  it('does not mask keys that only contain patterns as substrings', () => {
    const ctx = createMockContext({
      'animal.monkey': 'george',
      'food.turkey': 'thanksgiving',
      'feature.keyboard': 'mechanical',
      'auth.tokenized': 'should-not-mask',
    });

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties['animal.monkey']).toBe('george');
    expect(body.properties['food.turkey']).toBe('thanksgiving');
    expect(body.properties['feature.keyboard']).toBe('mechanical');
    expect(body.properties['auth.tokenized']).toBe('should-not-mask');
  });

  it('returns empty properties when no config component exists', () => {
    const ctx = createEmptyContext();

    const endpoint = new EnvEndpoint(ctx);
    const result = endpoint.env();

    const body = result.body as { properties: Record<string, unknown> };
    expect(body.properties).toEqual({});
  });
});
