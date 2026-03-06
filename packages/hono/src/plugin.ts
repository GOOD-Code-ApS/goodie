import type {
  CodegenContribution,
  IRBeanDefinition,
  IRRouteDefinition,
  IRRouteValidation,
  TransformerPlugin,
} from '@goodie-ts/transformer';

interface ControllerMeta {
  basePath: string;
  routes: IRRouteDefinition[];
}

interface ControllerBean {
  className: string;
  importPath: string;
  basePath: string;
  routes: IRRouteDefinition[];
}

/**
 * Transformer plugin that generates `createRouter()` and `startServer()`
 * for `@Controller` beans. Reads controller metadata from bean IR (set by
 * the resolver) and contributes Hono route-wiring code.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createHonoPlugin(): TransformerPlugin {
  return {
    name: 'hono',

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const controllerBeans = extractControllerBeans(beans);
      if (controllerBeans.length === 0) return {};

      const imports = buildImports(controllerBeans);
      const code = [
        ...generateCreateRouter(controllerBeans),
        '',
        'export async function startServer(options?: { port?: number; host?: string }) {',
        '  const ctx = await app.start()',
        '  const router = createRouter(ctx)',
        '  ctx.get(EmbeddedServer).listen(router, options)',
        '  return ctx',
        '}',
      ];

      return { imports, code };
    },
  };
}

function extractControllerBeans(beans: IRBeanDefinition[]): ControllerBean[] {
  const result: ControllerBean[] = [];
  for (const bean of beans) {
    const ctrl = bean.metadata.controller as ControllerMeta | undefined;
    if (!ctrl) continue;
    if (bean.tokenRef.kind !== 'class') continue;
    result.push({
      className: bean.tokenRef.className,
      importPath: bean.tokenRef.importPath,
      basePath: ctrl.basePath,
      routes: ctrl.routes,
    });
  }
  return result;
}

function buildImports(controllers: ControllerBean[]): string[] {
  const imports: string[] = [];
  imports.push("import { Hono } from 'hono'");
  imports.push("import { EmbeddedServer } from '@goodie-ts/hono'");

  const allRoutes = controllers.flatMap((c) => c.routes);
  const hasValidation = allRoutes.some(
    (r) => r.validation && r.validation.length > 0,
  );
  if (hasValidation) {
    imports.push("import { zValidator } from '@hono/zod-validator'");
    const schemaImports = collectSchemaImports(controllers);
    for (const [schemaRef, importPath] of schemaImports) {
      imports.push(`import { ${schemaRef} } from '${importPath}'`);
    }
  }

  return imports;
}

function generateCreateRouter(controllers: ControllerBean[]): string[] {
  const lines: string[] = [];
  const ctrlVarNames = buildControllerVarNames(controllers);

  lines.push('export function createRouter(ctx: ApplicationContext): Hono {');
  lines.push('  const __honoApp = new Hono()');

  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    lines.push(`  const ${varName} = ctx.get(${ctrl.className})`);
  }

  for (const ctrl of controllers) {
    const varName = ctrlVarNames.get(controllerKey(ctrl))!;
    for (const route of ctrl.routes) {
      const fullPath = escapeStringLiteral(
        joinPaths(ctrl.basePath, route.path),
      );
      const validationMiddleware = generateValidationMiddleware(
        route.validation,
      );

      if (validationMiddleware.length > 0) {
        lines.push(`  __honoApp.${route.httpMethod}('${fullPath}',`);
        for (const mw of validationMiddleware) {
          lines.push(`    ${mw},`);
        }
        lines.push('    async (c) => {');
      } else {
        lines.push(
          `  __honoApp.${route.httpMethod}('${fullPath}', async (c) => {`,
        );
      }
      lines.push(`    const result = await ${varName}.${route.methodName}(c)`);
      lines.push('    if (result instanceof Response) return result');
      lines.push(
        '    if (result === undefined || result === null) return c.body(null, 204)',
      );
      lines.push('    return c.json(result)');
      lines.push('  })');
    }
  }

  lines.push('  return __honoApp');
  lines.push('}');

  return lines;
}

function buildControllerVarNames(
  controllers: ControllerBean[],
): Map<string, string> {
  const result = new Map<string, string>();
  const varNameCounts = new Map<string, number>();

  for (const ctrl of controllers) {
    const key = controllerKey(ctrl);
    const baseVarName =
      ctrl.className.charAt(0).toLowerCase() + ctrl.className.slice(1);
    const count = varNameCounts.get(baseVarName) ?? 0;

    if (count === 0) {
      result.set(key, baseVarName);
    } else {
      result.set(key, `${baseVarName}_${count + 1}`);
    }
    varNameCounts.set(baseVarName, count + 1);
  }

  return result;
}

function controllerKey(ctrl: ControllerBean): string {
  return `${ctrl.className}:${ctrl.importPath}`;
}

function joinPaths(basePath: string, routePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (route === '/') return base || '/';
  return `${base}${route}`;
}

function escapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function generateValidationMiddleware(
  validation: IRRouteValidation[] | undefined,
): string[] {
  if (!validation || validation.length === 0) return [];
  return validation.map(
    (v) =>
      `zValidator('${v.target}', ${v.schemaRef}, (result, c) => { if (!result.success) return c.json({ error: 'Validation failed', issues: result.error.issues.map((i: any) => ({ path: i.path, message: i.message })) }, 400) })`,
  );
}

function collectSchemaImports(
  controllers: ControllerBean[],
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      if (!route.validation) continue;
      for (const v of route.validation) {
        if (!imports.has(v.schemaRef)) {
          imports.set(v.schemaRef, v.importPath);
        }
      }
    }
  }
  return imports;
}
