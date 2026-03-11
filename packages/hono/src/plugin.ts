import type {
  CodegenContext,
  CodegenContribution,
  IRBeanDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Hono adapter transformer plugin.
 *
 * Minimal codegen — emits the `createRouter` export and `app.onStart()` hook.
 * All route wiring is done at runtime by `createHonoRouter()` from `@goodie-ts/hono`.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHonoPlugin(): TransformerPlugin {
  return {
    name: 'hono',

    codegen(
      beans: IRBeanDefinition[],
      context?: CodegenContext,
    ): CodegenContribution {
      const hasControllers = beans.some(
        (b) => b.metadata.httpController !== undefined,
      );
      if (!hasControllers) return {};

      const config = context?.config ?? {};
      const isServerless = config['server.runtime'] === 'cloudflare';

      const imports = [
        "import { createHonoRouter, EmbeddedServer } from '@goodie-ts/hono'",
      ];

      const code = [
        'export function createRouter(ctx: ApplicationContext) {',
        '  return createHonoRouter(ctx)',
        '}',
      ];

      const onStart = isServerless
        ? undefined
        : [
            'const router = createRouter(ctx)',
            'await ctx.get(EmbeddedServer).listen(router)',
          ];

      return { imports, code, onStart };
    },
  };
}
