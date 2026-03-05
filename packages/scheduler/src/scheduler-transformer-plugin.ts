import type {
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import { SyntaxKind } from 'ts-morph';

interface ScheduleMethodInfo {
  methodName: string;
  cron?: string;
  fixedRate?: number;
  fixedDelay?: number;
  concurrent: boolean;
}

interface ScheduledClassInfo {
  className: string;
  filePath: string;
  methods: ScheduleMethodInfo[];
}

/**
 * Create the scheduler transformer plugin.
 *
 * Scans `@Scheduled` decorators on methods at compile time, validates options,
 * and synthesizes a `SchedulerService` bean with a custom factory that
 * statically registers all schedules. No runtime Symbol.metadata scanning needed.
 */
export function createSchedulerPlugin(): TransformerPlugin {
  /** Classes that contain at least one @Scheduled method. Keyed by filePath:className. */
  const scheduledClasses = new Map<string, ScheduledClassInfo>();

  return {
    name: 'scheduler',

    beforeScan(): void {
      scheduledClasses.clear();
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() !== 'Scheduled') continue;

        const args = decorator.getArguments();
        if (args.length === 0) continue;

        const opts = args[0];
        if (!opts.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

        // Extract schedule options
        let cron: string | undefined;
        let fixedRate: number | undefined;
        let fixedDelay: number | undefined;
        let concurrent = false;

        for (const prop of opts.getProperties()) {
          if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
          const name = prop.getName();
          const init = prop.getInitializer();
          if (!init) continue;
          const text = init.getText();

          if (name === 'cron') {
            cron = text.replace(/^['"]|['"]$/g, '');
          } else if (name === 'fixedRate') {
            fixedRate = Number(text);
          } else if (name === 'fixedDelay') {
            fixedDelay = Number(text);
          } else if (name === 'concurrent') {
            concurrent = text === 'true';
          }
        }

        // Compile-time validation: exactly one mode must be specified
        const modeCount =
          (cron !== undefined ? 1 : 0) +
          (fixedRate !== undefined ? 1 : 0) +
          (fixedDelay !== undefined ? 1 : 0);

        if (modeCount === 0) {
          const loc = decorator.getSourceFile().getFilePath();
          throw new Error(
            `@Scheduled on ${ctx.className}.${ctx.methodName} must specify exactly one of 'cron', 'fixedRate', or 'fixedDelay' (${loc})`,
          );
        }
        if (modeCount > 1) {
          const loc = decorator.getSourceFile().getFilePath();
          throw new Error(
            `@Scheduled on ${ctx.className}.${ctx.methodName} specifies multiple modes — use exactly one of 'cron', 'fixedRate', or 'fixedDelay' (${loc})`,
          );
        }

        // Validate cron expression is not empty
        if (cron !== undefined && cron.trim() === '') {
          const loc = decorator.getSourceFile().getFilePath();
          throw new Error(
            `@Scheduled on ${ctx.className}.${ctx.methodName} has an empty 'cron' expression — provide a valid cron pattern (${loc})`,
          );
        }

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = scheduledClasses.get(key) ?? {
          className: ctx.className,
          filePath: ctx.filePath,
          methods: [],
        };
        existing.methods.push({
          methodName: ctx.methodName,
          cron,
          fixedRate,
          fixedDelay,
          concurrent,
        });
        scheduledClasses.set(key, existing);
        break; // Only process first @Scheduled per method
      }
    },

    beforeCodegen(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      // Only create SchedulerService when @Scheduled methods are found
      if (scheduledClasses.size === 0) return beans;

      const scheduledDeps: IRBeanDefinition['constructorDeps'] = [];
      const matchedClasses: ScheduledClassInfo[] = [];

      for (const bean of beans) {
        if (bean.tokenRef.kind !== 'class') continue;

        const key = `${bean.tokenRef.importPath}:${bean.tokenRef.className}`;
        const info = scheduledClasses.get(key);
        if (info) {
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
          matchedClasses.push(info);
        }
      }

      // Build custom factory that statically registers all schedules
      const params = scheduledDeps.map((_, i) => `dep${i}: any`).join(', ');
      const addCalls: string[] = [];

      for (let i = 0; i < matchedClasses.length; i++) {
        for (const method of matchedClasses[i].methods) {
          const optsStr = JSON.stringify({
            cron: method.cron,
            fixedRate: method.fixedRate,
            fixedDelay: method.fixedDelay,
            concurrent: method.concurrent,
          });
          addCalls.push(
            `    __svc.addSchedule(dep${i}, '${method.methodName}', ${optsStr})`,
          );
        }
      }

      const customFactory = `(${params}) => {
    const __svc = new SchedulerService()
${addCalls.join('\n')}
    return __svc
  }`;

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
        customFactory,
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
