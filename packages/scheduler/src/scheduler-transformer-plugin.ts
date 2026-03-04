import type {
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

interface ScheduledClassInfo {
  className: string;
  filePath: string;
}

/**
 * Create the scheduler transformer plugin.
 *
 * Scans `@Scheduled` decorators on methods and synthesizes a `SchedulerService`
 * bean with individual constructor deps on all scheduled beans.
 */
export function createSchedulerPlugin(): TransformerPlugin {
  /** Classes that contain at least one @Scheduled method. Keyed by filePath:className. */
  const scheduledClasses = new Map<string, ScheduledClassInfo>();

  return {
    name: 'scheduler',

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'Scheduled') continue;

        const key = `${ctx.filePath}:${ctx.className}`;
        if (!scheduledClasses.has(key)) {
          scheduledClasses.set(key, {
            className: ctx.className,
            filePath: ctx.filePath,
          });
        }
        break;
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Only create SchedulerService when @Scheduled methods are found
      if (scheduledClasses.size === 0) return beans;

      const scheduledDeps: IRBeanDefinition['constructorDeps'] = [];

      for (const bean of beans) {
        if (bean.tokenRef.kind !== 'class') continue;

        const key = `${bean.tokenRef.importPath}:${bean.tokenRef.className}`;
        if (scheduledClasses.has(key)) {
          scheduledDeps.push({
            tokenRef: {
              kind: 'class',
              className: bean.tokenRef.className,
              importPath: bean.tokenRef.importPath,
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/scheduler',
              line: 0,
              column: 0,
            },
          });
        }
      }

      const schedulerServiceBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'SchedulerService',
          importPath: '@goodie-ts/scheduler',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        constructorDeps: scheduledDeps,
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {
          postConstructMethods: ['start'],
          preDestroyMethods: ['stop'],
        },
        sourceLocation: {
          filePath: '@goodie-ts/scheduler',
          line: 0,
          column: 0,
        },
      };

      return [...beans, schedulerServiceBean];
    },
  };
}

export default createSchedulerPlugin;
