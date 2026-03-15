import type { ComponentDefinition } from '@goodie-ts/core';
import { ApplicationContext } from '@goodie-ts/core';
import { bench, describe } from 'vitest';
import { generateComponentDefinitions } from './helpers.js';

// Pre-generate definitions for each size
const sizes = [50, 100, 500] as const;
const defsBySize = new Map<number, ComponentDefinition[]>();
for (const n of sizes) {
  defsBySize.set(n, generateComponentDefinitions(n));
}

// ── ApplicationContext.create() ──

describe('ApplicationContext.create()', () => {
  for (const n of sizes) {
    const defs = defsBySize.get(n)!;
    bench(`${n} components (with topoSort)`, async () => {
      await ApplicationContext.create(defs);
    });

    bench(`${n} components (preSorted)`, async () => {
      await ApplicationContext.create(defs, { preSorted: true });
    });
  }
});

// ── Singleton resolution ──

describe('singleton get()', () => {
  for (const n of sizes) {
    const defs = defsBySize.get(n)!;
    // The last component in the chain depends on all others transitively
    const lastToken = defs[n - 1].token;

    let ctx: ApplicationContext;
    bench(
      `${n} components — resolve leaf`,
      async () => {
        ctx.get(lastToken);
      },
      {
        async setup() {
          ctx = await ApplicationContext.create(defs, { preSorted: true });
          // Warm up — first get triggers lazy instantiation of the full chain
          ctx.get(lastToken);
        },
      },
    );
  }
});

// ── Prototype resolution ──

describe('prototype get()', () => {
  const prototypeDefs = generateComponentDefinitions(100, 'prototype');
  const lastToken = prototypeDefs[99].token;

  let ctx: ApplicationContext;
  bench(
    '100 components — resolve leaf (new instance each call)',
    async () => {
      ctx.get(lastToken);
    },
    {
      async setup() {
        ctx = await ApplicationContext.create(prototypeDefs, {
          preSorted: true,
        });
      },
    },
  );
});

// ── getAll() collection resolution ──

describe('getAll()', () => {
  // Create 100 components all registered under a shared base token
  const BaseClass = class Base {} as new (...args: unknown[]) => unknown;
  const collectionDefs: ComponentDefinition[] = [];
  for (let i = 0; i < 100; i++) {
    const token = new Function(`return class Sub${i} {}`)() as new (
      ...args: unknown[]
    ) => unknown;
    collectionDefs.push({
      token,
      scope: 'singleton',
      dependencies: [],
      factory: () => new token(),
      eager: false,
      baseTokens: [BaseClass],
      metadata: {},
    });
  }

  let ctx: ApplicationContext;
  bench(
    '100 components under shared base token',
    async () => {
      ctx.getAll(BaseClass);
    },
    {
      async setup() {
        ctx = await ApplicationContext.create(collectionDefs, {
          preSorted: true,
        });
        // Warm up
        ctx.getAll(BaseClass);
      },
    },
  );
});
