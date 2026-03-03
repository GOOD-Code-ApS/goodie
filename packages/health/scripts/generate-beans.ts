import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformLibrary } from '@goodie-ts/transformer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = await transformLibrary({
  tsConfigFilePath: path.resolve(__dirname, '../tsconfig.json'),
  packageName: '@goodie-ts/health',
  beansOutputPath: path.resolve(__dirname, '../dist/beans.json'),
  disablePluginDiscovery: true,
});

console.log(`Generated ${result.outputPath} (${result.beans.length} bean(s))`);
