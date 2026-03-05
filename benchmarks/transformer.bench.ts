import {
  buildGraph,
  generateCode,
  resolve,
  scan,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { bench, describe } from 'vitest';
import { generateBeanSource } from './helpers.js';

function createBenchProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

// Pre-generate source files for each size
const sizes = [50, 100, 500] as const;
const sources = new Map<number, ReturnType<typeof generateBeanSource>>();

for (const n of sizes) {
  sources.set(n, generateBeanSource(n));
}

// ── Full pipeline (scan → resolve → graph → codegen) ──

describe('full pipeline (transformInMemory)', () => {
  for (const n of sizes) {
    bench(`${n} beans`, () => {
      const project = createBenchProject(sources.get(n)!);
      transformInMemory(project, '/out/AppContext.generated.ts');
    });
  }
});

// ── Scanner only ──

describe('scanner (scan)', () => {
  for (const n of sizes) {
    bench(`${n} beans`, () => {
      const project = createBenchProject(sources.get(n)!);
      scan(project);
    });
  }
});

// ── Codegen only ──

describe('codegen (generateCode)', () => {
  // Pre-compute beans for codegen benchmarks (scan + resolve + graph once)
  const precomputed = new Map<
    number,
    {
      beans: ReturnType<typeof buildGraph>['beans'];
      controllers: ReturnType<typeof buildGraph>['controllers'];
    }
  >();

  for (const n of sizes) {
    const project = createBenchProject(sources.get(n)!);
    const scanResult = scan(project);
    const resolveResult = resolve(scanResult);
    const graphResult = buildGraph(resolveResult);
    precomputed.set(n, {
      beans: graphResult.beans,
      controllers: graphResult.controllers,
    });
  }

  for (const n of sizes) {
    const { beans, controllers } = precomputed.get(n)!;
    bench(`${n} beans`, () => {
      generateCode(
        beans,
        { outputPath: '/out/AppContext.generated.ts' },
        [],
        controllers,
      );
    });
  }
});
