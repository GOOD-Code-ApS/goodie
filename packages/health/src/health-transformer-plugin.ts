import type {
  CodegenContribution,
  IRBeanDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

const HEALTH_IMPORT_PATH = '@goodie-ts/health';

/**
 * Create the health transformer plugin.
 *
 * Detects beans that extend `HealthIndicator` (via `baseTokenRefs` set by the
 * resolver). When at least one indicator subtype is found, injects synthetic
 * `UptimeHealthIndicator` and `HealthAggregator` beans so that the health
 * subsystem is fully wired without manual registration.
 *
 * `HealthAggregator` receives all `HealthIndicator` beans via a collection
 * constructor dependency (`collection: true`), matching Micronaut's pattern.
 */
export function createHealthPlugin(): TransformerPlugin {
  return {
    name: 'health',

    beforeCodegen(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Check if any user-defined bean extends HealthIndicator
      const hasHealthIndicators = beans.some((bean) =>
        bean.baseTokenRefs?.some((ref) => ref.className === 'HealthIndicator'),
      );

      if (!hasHealthIndicators) return beans;

      const syntheticBeans: IRBeanDefinition[] = [];

      // Inject synthetic UptimeHealthIndicator (built-in, always included)
      syntheticBeans.push({
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
      });

      // Inject synthetic HealthAggregator with collection dep on HealthIndicator
      syntheticBeans.push({
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
      });

      return [...beans, ...syntheticBeans];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasHealthAggregator = beans.some(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'HealthAggregator' &&
          b.tokenRef.importPath === HEALTH_IMPORT_PATH,
      );

      if (!hasHealthAggregator) return {};

      return {
        imports: [
          `import { HealthAggregator, HealthIndicator, UptimeHealthIndicator } from '${HEALTH_IMPORT_PATH}'`,
        ],
      };
    },
  };
}

export default createHealthPlugin;
