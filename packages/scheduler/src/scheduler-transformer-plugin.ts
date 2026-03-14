import {
  InvalidDecoratorUsageError,
  type IRComponentDefinition,
  type MethodVisitorContext,
  type TransformerPlugin,
} from '@goodie-ts/transformer';
import { SyntaxKind } from 'ts-morph';

import type { ScheduledMethodMeta } from './scheduler-service.js';

/**
 * Create the scheduler transformer plugin.
 *
 * Scans `@Scheduled` decorators on methods at compile time, validates options,
 * and stores schedule metadata on each bean. When at least one `@Scheduled`
 * method exists, synthesizes a `SchedulerService` bean that depends on
 * `ApplicationContext` and discovers schedules via metadata at startup.
 */
export function createSchedulerPlugin(): TransformerPlugin {
  return {
    name: 'scheduler',

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
            const strLit =
              init.asKind(SyntaxKind.StringLiteral) ??
              init.asKind(SyntaxKind.NoSubstitutionTemplateLiteral);
            cron = strLit
              ? strLit.getLiteralValue()
              : text.replace(/^['"]|['"]$/g, '');
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

        const sourceLocation = {
          filePath: decorator.getSourceFile().getFilePath(),
          line: decorator.getStartLineNumber(),
          column: 1,
        };

        if (modeCount === 0) {
          throw new InvalidDecoratorUsageError(
            'Scheduled',
            `${ctx.className}.${ctx.methodName} must specify exactly one of 'cron', 'fixedRate', or 'fixedDelay'`,
            sourceLocation,
          );
        }
        if (modeCount > 1) {
          throw new InvalidDecoratorUsageError(
            'Scheduled',
            `${ctx.className}.${ctx.methodName} specifies multiple modes — use exactly one of 'cron', 'fixedRate', or 'fixedDelay'`,
            sourceLocation,
          );
        }

        // Validate cron expression is not empty
        if (cron !== undefined && cron.trim() === '') {
          throw new InvalidDecoratorUsageError(
            'Scheduled',
            `${ctx.className}.${ctx.methodName} has an empty 'cron' expression — provide a valid cron pattern`,
            sourceLocation,
          );
        }

        // Store metadata on the bean — merged into IRComponentDefinition.metadata by the scanner
        const existing = (ctx.classMetadata.scheduledMethods ??
          []) as ScheduledMethodMeta[];
        existing.push({
          methodName: ctx.methodName,
          cron,
          fixedRate,
          fixedDelay,
          concurrent,
        });
        ctx.classMetadata.scheduledMethods = existing;

        break; // Only process first @Scheduled per method
      }
    },

    beforeCodegen(beans: IRComponentDefinition[]): IRComponentDefinition[] {
      // Only create SchedulerService when @Scheduled methods are found
      const hasScheduledMethods = beans.some(
        (b) =>
          b.metadata.scheduledMethods &&
          (b.metadata.scheduledMethods as unknown[]).length > 0,
      );
      if (!hasScheduledMethods) return beans;

      const schedulerServiceBean: IRComponentDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'SchedulerService',
          importPath: '@goodie-ts/scheduler',
        },
        scope: 'singleton',
        eager: true,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'ApplicationContext',
              importPath: '@goodie-ts/core',
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/scheduler',
              line: 0,
              column: 0,
            },
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {
          onInitMethods: ['start'],
          onDestroyMethods: ['stop'],
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
