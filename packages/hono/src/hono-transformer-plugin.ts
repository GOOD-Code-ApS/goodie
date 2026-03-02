import type {
  ClassVisitorContext,
  CodegenContribution,
  IRBeanDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Create the Hono transformer plugin.
 *
 * Scans @Controller decorated classes and generates a `startServer()` function
 * in the generated code. The function bootstraps the DI context, wires routes
 * via the already-generated `createRouter()`, and starts the HTTP server.
 *
 * All route wiring is compile-time — no runtime metadata discovery.
 */
export function createHonoPlugin(): TransformerPlugin {
  let hasControllers = false;

  return {
    name: 'hono',

    visitClass(ctx: ClassVisitorContext): void {
      for (const dec of ctx.classDeclaration.getDecorators()) {
        if (dec.getName() === 'Controller') {
          hasControllers = true;
          return;
        }
      }
    },

    codegen(_beans: IRBeanDefinition[]): CodegenContribution {
      if (!hasControllers) return {};

      return {
        imports: ["import { serve } from '@hono/node-server'"],
        code: [
          'export async function startServer(options?: { port?: number }) {',
          '  const ctx = await app.start()',
          '  const router = createRouter(ctx)',
          '  const port = options?.port ?? (Number(process.env.PORT) || 3000)',
          '  serve({ fetch: router.fetch, port })',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: generated code template literal
          '  console.log(`Server started on http://localhost:${port}`)',
          '  return ctx',
          '}',
        ],
      };
    },
  };
}
