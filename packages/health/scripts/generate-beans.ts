import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IRBeanDefinition } from '@goodie-ts/transformer';
import { serializeBeans } from '@goodie-ts/transformer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEALTH_IMPORT_PATH = '@goodie-ts/health';

const beans: IRBeanDefinition[] = [
  {
    tokenRef: {
      kind: 'class',
      className: 'UptimeHealthIndicator',
      importPath: HEALTH_IMPORT_PATH,
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    baseTokenRefs: [
      {
        kind: 'class',
        className: 'HealthIndicator',
        importPath: HEALTH_IMPORT_PATH,
      },
    ],
    metadata: {},
    sourceLocation: {
      filePath: HEALTH_IMPORT_PATH,
      line: 0,
      column: 0,
    },
  },
  {
    tokenRef: {
      kind: 'class',
      className: 'HealthAggregator',
      importPath: HEALTH_IMPORT_PATH,
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [
      {
        tokenRef: {
          kind: 'class',
          className: 'HealthIndicator',
          importPath: HEALTH_IMPORT_PATH,
        },
        optional: false,
        collection: true,
        sourceLocation: {
          filePath: HEALTH_IMPORT_PATH,
          line: 0,
          column: 0,
        },
      },
    ],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: {
      filePath: HEALTH_IMPORT_PATH,
      line: 0,
      column: 0,
    },
  },
];

const manifest = serializeBeans(beans, HEALTH_IMPORT_PATH);
const outputPath = path.resolve(__dirname, '../dist/beans.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`Generated ${outputPath}`);
