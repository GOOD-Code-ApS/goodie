import {
  buildGraph,
  generateCode,
  resolve,
  scan,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { bench, describe } from 'vitest';
import { generateComponentSource } from './helpers.js';

function createBenchProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

// Pre-generate source files for each size
const sizes = [50, 100, 500] as const;
const sources = new Map<number, ReturnType<typeof generateComponentSource>>();

for (const n of sizes) {
  sources.set(n, generateComponentSource(n));
}

// ── Full pipeline (scan → resolve → graph → codegen) ──

describe('full pipeline (transformInMemory)', () => {
  for (const n of sizes) {
    bench(`${n} components`, () => {
      const project = createBenchProject(sources.get(n)!);
      transformInMemory(project, '/out/AppContext.generated.ts');
    });
  }
});

// ── Scanner only ──

describe('scanner (scan)', () => {
  for (const n of sizes) {
    bench(`${n} components`, () => {
      const project = createBenchProject(sources.get(n)!);
      scan(project);
    });
  }
});

// ── Codegen only ──

describe('codegen (generateCode)', () => {
  // Pre-compute components for codegen benchmarks (scan + resolve + graph once)
  const precomputed = new Map<
    number,
    {
      components: ReturnType<typeof buildGraph>['components'];
      controllers: ReturnType<typeof buildGraph>['controllers'];
    }
  >();

  for (const n of sizes) {
    const project = createBenchProject(sources.get(n)!);
    const scanResult = scan(project);
    const resolveResult = resolve(scanResult);
    const graphResult = buildGraph(resolveResult);
    precomputed.set(n, {
      components: graphResult.components,
      controllers: graphResult.controllers,
    });
  }

  for (const n of sizes) {
    const { components, controllers } = precomputed.get(n)!;
    bench(`${n} components`, () => {
      generateCode(
        components,
        { outputPath: '/out/AppContext.generated.ts' },
        [],
        controllers,
      );
    });
  }
});
