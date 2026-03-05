import type { BeanDefinition, Dependency } from '@goodie-ts/core';

/** Standard decorator stubs for in-memory benchmark projects. */
const DECORATOR_STUBS = `
export function Injectable() { return (t: any, c: any) => {} }
export function Singleton() { return (t: any, c: any) => {} }
export function Named(n: string) { return (t: any, c: any) => {} }
export function Eager() { return (t: any, c: any) => {} }
export function Module(opts?: any) { return (t: any, c: any) => {} }
export function Provides() { return (t: any, c: any) => {} }
export function Inject(q: any) { return (t: any, c: any) => {} }
export function Optional() { return (t: any, c: any) => {} }
export function PreDestroy() { return (t: any, c: any) => {} }
export function PostConstruct() { return (t: any, c: any) => {} }
`;

/**
 * Generate source files containing N @Injectable classes forming a dependency chain.
 * Bean0 has no deps, Bean1 depends on Bean0, Bean2 depends on Bean1, etc.
 * Returns a files map for use with ts-morph Project.
 */
export function generateBeanSource(n: number): Record<string, string> {
  const files: Record<string, string> = {
    '/src/decorators.ts': DECORATOR_STUBS,
  };

  // Generate in batches of 50 classes per file to avoid huge single files
  const batchSize = 50;
  const batches = Math.ceil(n / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const start = batch * batchSize;
    const end = Math.min(start + batchSize, n);
    const lines: string[] = [];

    lines.push("import { Injectable } from './decorators';");

    // Import dependencies from previous batches
    const importedBatches = new Set<number>();
    for (let i = start; i < end; i++) {
      if (i > 0) {
        const depBatch = Math.floor((i - 1) / batchSize);
        if (depBatch !== batch && !importedBatches.has(depBatch)) {
          importedBatches.add(depBatch);
          const depClasses: string[] = [];
          for (
            let j = depBatch * batchSize;
            j < Math.min((depBatch + 1) * batchSize, n);
            j++
          ) {
            if (j >= start - 1 && j < start) {
              depClasses.push(`Bean${j}`);
            }
          }
          if (depClasses.length > 0) {
            lines.push(
              `import { ${depClasses.join(', ')} } from './beans_${depBatch}';`,
            );
          }
        }
      }
    }

    lines.push('');

    for (let i = start; i < end; i++) {
      lines.push('@Injectable()');
      if (i === 0) {
        lines.push(`export class Bean${i} {}`);
      } else {
        lines.push(
          `export class Bean${i} { constructor(private dep: Bean${i - 1}) {} }`,
        );
      }
      lines.push('');
    }

    files[`/src/beans_${batch}.ts`] = lines.join('\n');
  }

  return files;
}

/**
 * Generate N BeanDefinition objects for runtime benchmarks.
 * Creates a dependency chain: Bean0 ← Bean1 ← Bean2 ← ... ← BeanN-1.
 * Each "class" is a unique function constructor.
 */
export function generateBeanDefinitions(
  n: number,
  scope: 'singleton' | 'prototype' = 'singleton',
): BeanDefinition[] {
  const tokens: (new (...args: unknown[]) => unknown)[] = [];
  for (let i = 0; i < n; i++) {
    tokens.push(
      new Function(`return class Bean${i} {}`)() as new (
        ...args: unknown[]
      ) => unknown,
    );
  }

  return tokens.map((token, i) => {
    const deps: Dependency[] =
      i === 0
        ? []
        : [{ token: tokens[i - 1], optional: false, collection: false }];

    return {
      token,
      scope,
      dependencies: deps,
      factory: (...args: unknown[]) => new token(...args),
      eager: false,
      metadata: {},
    };
  });
}
