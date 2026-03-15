import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/component-definition.js';
import type { Scope } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: ComponentDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T | Promise<T>;
    scope?: Scope;
    eager?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
): ComponentDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: opts.eager ?? false,
    metadata: opts.metadata ?? {},
  };
}

class ServiceA {}
class ServiceB {}

// ── Tests ────────────────────────────────────────────────────────────

describe('StartupMetrics', () => {
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalDebug = process.env.GOODIE_DEBUG;
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.GOODIE_DEBUG;
    } else {
      process.env.GOODIE_DEBUG = originalDebug;
    }
  });

  it('does NOT collect metrics when GOODIE_DEBUG is unset', async () => {
    delete process.env.GOODIE_DEBUG;

    const ctx = await ApplicationContext.create([
      makeDef(ServiceA, { eager: true }),
    ]);

    expect(ctx.getStartupMetrics()).toBeUndefined();
  });

  it('does NOT collect metrics when GOODIE_DEBUG is not "true"', async () => {
    process.env.GOODIE_DEBUG = 'false';

    const ctx = await ApplicationContext.create([
      makeDef(ServiceA, { eager: true }),
    ]);

    expect(ctx.getStartupMetrics()).toBeUndefined();
  });

  it('collects metrics when GOODIE_DEBUG=true', async () => {
    process.env.GOODIE_DEBUG = 'true';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ctx = await ApplicationContext.create([
      makeDef(ServiceA, { eager: true }),
      makeDef(ServiceB, {
        deps: [dep(ServiceA)],
        eager: true,
      }),
    ]);

    const metrics = ctx.getStartupMetrics();
    expect(metrics).toBeDefined();
    expect(metrics!.getStage('topoSort')).toBeTypeOf('number');
    expect(metrics!.getStage('validateDependencies')).toBeTypeOf('number');
    expect(metrics!.getStage('initPostProcessors')).toBeTypeOf('number');
    expect(metrics!.getStage('initEagerBeans')).toBeTypeOf('number');
    expect(metrics!.getTotal()).toBeGreaterThanOrEqual(0);

    consoleSpy.mockRestore();
  });

  it('tracks per-bean resolution times for eager beans', async () => {
    process.env.GOODIE_DEBUG = 'true';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ctx = await ApplicationContext.create([
      makeDef(ServiceA, { eager: true }),
      makeDef(ServiceB, {
        deps: [dep(ServiceA)],
        eager: true,
      }),
    ]);

    const metrics = ctx.getStartupMetrics()!;
    const componentTimings = metrics.getComponentTimings();

    expect(componentTimings.has('ServiceA')).toBe(true);
    expect(componentTimings.has('ServiceB')).toBe(true);
    expect(componentTimings.get('ServiceA')).toBeTypeOf('number');
    expect(componentTimings.get('ServiceB')).toBeTypeOf('number');

    consoleSpy.mockRestore();
  });

  it('does not track non-eager beans', async () => {
    process.env.GOODIE_DEBUG = 'true';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ctx = await ApplicationContext.create([
      makeDef(ServiceA, { eager: false }),
    ]);

    const metrics = ctx.getStartupMetrics()!;
    expect(metrics.getComponentTimings().size).toBe(0);

    consoleSpy.mockRestore();
  });

  it('prints formatted output with expected sections', async () => {
    process.env.GOODIE_DEBUG = 'true';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ApplicationContext.create([makeDef(ServiceA, { eager: true })]);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');

    expect(output).toContain('[goodie] Startup metrics');
    expect(output).toContain('topoSort');
    expect(output).toContain('validateDependencies');
    expect(output).toContain('initPostProcessors');
    expect(output).toContain('initEagerBeans');
    expect(output).toContain('total');
    expect(output).toContain('Eager bean resolution');
    expect(output).toContain('ServiceA');

    consoleSpy.mockRestore();
  });

  it('returns undefined from getStartupMetrics when disabled', async () => {
    delete process.env.GOODIE_DEBUG;

    const ctx = await ApplicationContext.create([]);

    expect(ctx.getStartupMetrics()).toBeUndefined();
  });
});
