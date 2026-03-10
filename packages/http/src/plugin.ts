import type {
  ClassVisitorContext,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

import type {
  ControllerMetadata,
  HttpMethod,
  RouteMetadata,
} from './route-metadata.js';

/** Route decorator names mapped to HTTP methods. */
const ROUTE_DECORATOR_MAP: Record<string, HttpMethod> = {
  Get: 'get',
  Post: 'post',
  Put: 'put',
  Delete: 'delete',
  Patch: 'patch',
};

/**
 * HTTP scan-phase transformer plugin.
 *
 * Scans `@Controller` classes and `@Get`/`@Post`/etc. route methods,
 * populating `metadata.httpController` with `ControllerMetadata`.
 *
 * This is the abstract HTTP layer — no framework-specific codegen.
 * Adapter plugins (e.g. Hono) read `metadata.httpController` and
 * generate framework-specific wiring code.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHttpPlugin(): TransformerPlugin {
  return {
    name: 'http',

    visitClass(ctx: ClassVisitorContext): void {
      const { classDeclaration, metadata } = ctx;
      const decorators = classDeclaration.getDecorators();
      const controllerDec = decorators.find(
        (d) => d.getName() === 'Controller',
      );
      if (!controllerDec) return;

      // Extract basePath from @Controller argument
      let basePath = '/';
      const args = controllerDec.getArguments();
      if (args.length > 0) {
        const argText = args[0].getText();
        if (
          (argText.startsWith("'") && argText.endsWith("'")) ||
          (argText.startsWith('"') && argText.endsWith('"'))
        ) {
          basePath = argText.slice(1, -1);
        }
      }

      ctx.registerBean({ scope: 'singleton', decoratorName: 'Controller' });

      // Scan class-level @Secured
      const classSecured = decorators.some((d) => d.getName() === 'Secured');

      // Initialize controller metadata — routes populated by visitMethod
      metadata.httpController = {
        basePath,
        routes: [],
        ...(classSecured ? { secured: true } : {}),
      } satisfies ControllerMetadata;
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const controller = ctx.classMetadata.httpController as
        | ControllerMetadata
        | undefined;
      if (!controller) return;

      const { methodDeclaration, methodName } = ctx;
      const decorators = methodDeclaration.getDecorators();

      // Find a route decorator (@Get, @Post, etc.)
      let httpMethod: HttpMethod | undefined;
      let path = '/';
      for (const dec of decorators) {
        const matched = ROUTE_DECORATOR_MAP[dec.getName()];
        if (!matched) continue;
        httpMethod = matched;

        const args = dec.getArguments();
        if (args.length > 0) {
          const argText = args[0].getText();
          if (
            (argText.startsWith("'") && argText.endsWith("'")) ||
            (argText.startsWith('"') && argText.endsWith('"'))
          ) {
            path = argText.slice(1, -1);
          }
        }
        break;
      }

      if (!httpMethod) return;

      // Scan method-level @Secured and @Anonymous
      const methodSecured = decorators.some((d) => d.getName() === 'Secured');
      const methodAnonymous = decorators.some(
        (d) => d.getName() === 'Anonymous',
      );

      const route: RouteMetadata = {
        methodName,
        httpMethod,
        path,
        ...(methodSecured ? { secured: true } : {}),
        ...(methodAnonymous ? { anonymous: true } : {}),
      };

      controller.routes.push(route);
    },
  };
}
