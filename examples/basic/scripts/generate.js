#!/usr/bin/env node
import path from 'node:path';
import { transform } from '@goodie/transformer';

const root = path.resolve(import.meta.dirname, '..');

const result = transform({
  tsConfigFilePath: path.join(root, 'tsconfig.json'),
  outputPath: path.join(root, 'src', 'AppContext.generated.ts'),
});

console.log(`Generated ${result.outputPath}`);
console.log(`  Beans: ${result.beans.length}`);
for (const w of result.warnings) {
  console.warn(`  Warning: ${w}`);
}
