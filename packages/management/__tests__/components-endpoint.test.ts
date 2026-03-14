import {
  ApplicationContext,
  type ComponentDefinition,
  type InjectionToken,
} from '@goodie-ts/core';
import { Response } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import { ComponentsEndpoint } from '../src/components-endpoint.js';

class TodoService {}
class TodoRepository {}

function createMockContext(
  definitions: ComponentDefinition[],
): ApplicationContext {
  return {
    getDefinitions: vi.fn().mockReturnValue(definitions),
  } as unknown as ApplicationContext;
}

function createClassDef(
  token: new (...args: any[]) => unknown,
  opts: {
    scope?: string;
    eager?: boolean;
    dependencies?: Array<{
      token: new (...args: any[]) => unknown | InjectionToken<unknown>;
      optional?: boolean;
      collection?: boolean;
    }>;
    conditionalRules?: unknown[];
  } = {},
): ComponentDefinition {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    eager: opts.eager ?? false,
    dependencies: (opts.dependencies ?? []).map((d) => ({
      token: d.token,
      optional: d.optional ?? false,
      collection: d.collection ?? false,
    })),
    factory: () => null,
    metadata: opts.conditionalRules
      ? { conditionalRules: opts.conditionalRules }
      : {},
  } as ComponentDefinition;
}

describe('ComponentsEndpoint', () => {
  it('lists all bean definitions with tokens and scopes', () => {
    const ctx = createMockContext([
      createClassDef(TodoService, {
        dependencies: [{ token: TodoRepository }],
      }),
      createClassDef(TodoRepository),
    ]);

    const endpoint = new ComponentsEndpoint(ctx);
    const result = endpoint.beans();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);

    const body = result.body as {
      beans: Array<{
        token: string;
        scope: string;
        eager: boolean;
        dependencies: Array<{
          token: string;
          optional: boolean;
          collection: boolean;
        }>;
        conditional: unknown;
      }>;
    };
    expect(body.beans).toHaveLength(2);

    expect(body.beans[0].token).toBe('TodoService');
    expect(body.beans[0].scope).toBe('singleton');
    expect(body.beans[0].eager).toBe(false);
    expect(body.beans[0].dependencies).toEqual([
      { token: 'TodoRepository', optional: false, collection: false },
    ]);
    expect(body.beans[0].conditional).toBeNull();

    expect(body.beans[1].token).toBe('TodoRepository');
    expect(body.beans[1].dependencies).toEqual([]);
  });

  it('includes conditional rules when present', () => {
    const rules = [
      { type: 'property', property: 'datasource.dialect', value: 'postgres' },
    ];
    const ctx = createMockContext([
      createClassDef(TodoService, { conditionalRules: rules }),
    ]);

    const endpoint = new ComponentsEndpoint(ctx);
    const result = endpoint.beans();

    const body = result.body as { beans: Array<{ conditional: unknown }> };
    expect(body.beans[0].conditional).toEqual(rules);
  });

  it('filters out internal framework beans', () => {
    const configToken = {
      description: '__Goodie_Config',
    } as InjectionToken<Record<string, unknown>>;

    const configDef = {
      token: configToken,
      scope: 'singleton',
      eager: false,
      dependencies: [],
      factory: () => ({}),
      metadata: {},
    } as ComponentDefinition;

    const appContextDef = {
      token: ApplicationContext,
      scope: 'singleton',
      eager: false,
      dependencies: [],
      factory: () => null,
      metadata: {},
    } as ComponentDefinition;

    const ctx = createMockContext([
      appContextDef,
      configDef,
      createClassDef(TodoService),
    ]);

    const endpoint = new ComponentsEndpoint(ctx);
    const result = endpoint.beans();

    const body = result.body as { beans: Array<{ token: string }> };
    expect(body.beans).toHaveLength(1);
    expect(body.beans[0].token).toBe('TodoService');
  });

  it('shows eager status', () => {
    const ctx = createMockContext([
      createClassDef(TodoService, { eager: true }),
    ]);

    const endpoint = new ComponentsEndpoint(ctx);
    const result = endpoint.beans();

    const body = result.body as { beans: Array<{ eager: boolean }> };
    expect(body.beans[0].eager).toBe(true);
  });
});
