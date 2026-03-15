import type {
  ControllerMetadata,
  ParamMetadata,
  RouteMetadata,
} from '@goodie-ts/http';
import type {
  EmitFilesContext,
  IRComponentDefinition,
  TransformerPlugin,
} from '@goodie-ts/transformer';
import type { CodeBlockWriter } from 'ts-morph';

/**
 * Hono adapter transformer plugin.
 *
 * Uses `emitFiles` to generate a `routes.ts` file with pre-compiled
 * route wiring — Micronaut-style `$Route` executor pattern.
 *
 * Each controller route is generated with explicit param extraction,
 * type coercion, and method calls. No runtime metadata interpretation.
 *
 * When body params have a known type (class with `typeImportPath`), the
 * generated code calls `BodyValidator.validate()` from `@goodie-ts/http`.
 * If no `BodyValidator` is registered in the DI context (e.g. no validation
 * package), the body passes through unvalidated.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/hono-plugin.js" }` in package.json.
 */
export default function createHonoPlugin(): TransformerPlugin {
  return {
    name: 'hono',

    emitFiles(ctx: EmitFilesContext): void {
      const controllers = findControllers(ctx.components);
      if (controllers.length === 0) return;

      const bodyTypes = collectBodyParamTypes(controllers);
      const hasBodyValidation = bodyTypes.size > 0;

      const sf = ctx.createSourceFile('routes.ts');

      // Imports
      sf.addImportDeclaration({
        moduleSpecifier: '@goodie-ts/hono',
        namedImports: ['buildHttpContext', 'toHonoResponse'],
      });

      const httpImports = [
        'ExceptionHandler',
        'handleException',
        'registerGeneratedRoutes',
      ];
      if (hasBodyValidation) {
        httpImports.push('BodyValidator');
      }
      sf.addImportDeclaration({
        moduleSpecifier: '@goodie-ts/http',
        namedImports: httpImports,
      });

      sf.addImportDeclaration({
        moduleSpecifier: '@goodie-ts/core',
        isTypeOnly: true,
        namedImports: ['ApplicationContext'],
      });
      sf.addImportDeclaration({
        moduleSpecifier: 'hono',
        namedImports: ['Hono'],
      });
      sf.addImportDeclaration({
        moduleSpecifier: 'hono',
        isTypeOnly: true,
        namedImports: ['Context'],
      });

      // Controller class imports
      for (const { component } of controllers) {
        if (component.tokenRef.kind !== 'class') continue;
        const importPath = ctx.relativeImport(component.tokenRef.importPath);
        sf.addImportDeclaration({
          moduleSpecifier: importPath,
          namedImports: [component.tokenRef.className],
        });
      }

      // Body param type imports (for BodyValidator.validate() calls)
      for (const [className, importPath] of bodyTypes) {
        sf.addImportDeclaration({
          moduleSpecifier: ctx.relativeImport(importPath),
          namedImports: [className],
        });
      }

      // Generate the createRoutes function body using CodeBlockWriter
      const writer = sf.getProject().createWriter();
      writer
        .write(
          'function createRoutes(ctx: ApplicationContext, router: Hono, __exh: ExceptionHandler[]): void',
        )
        .block(() => {
          // Resolve BodyValidator from DI (optional — empty array if not present)
          if (hasBodyValidation) {
            writer.writeLine('const __bv = ctx.getAll(BodyValidator);');
            writer.writeLine(
              'const __bodyValidator = __bv.length > 0 ? __bv[0] : undefined;',
            );
            writer.blankLine();
          }

          for (const { component, metadata } of controllers) {
            if (component.tokenRef.kind !== 'class') continue;
            const className = component.tokenRef.className;
            const varName = `__${className[0].toLowerCase()}${className.slice(1)}`;

            writer.writeLine(`const ${varName} = ctx.get(${className});`);
            writeControllerRoutes(writer, varName, metadata, hasBodyValidation);
            writer.blankLine();
          }
        });

      writer.blankLine();
      writer.writeLine('registerGeneratedRoutes(createRoutes);');

      sf.addStatements(writer.toString());
    },
  };
}

/**
 * Write all routes for a controller as a `router.route(basePath, subRouter)` call.
 *
 * Builds a sub-router per controller with chained `.get()/.post()/etc.` calls.
 * Each route handler has pre-compiled param extraction and error handling.
 */
function writeControllerRoutes(
  writer: CodeBlockWriter,
  ctrlVar: string,
  metadata: ControllerMetadata,
  hasBodyValidation: boolean,
): void {
  // Build sub-router in a variable so we can chain cleanly
  const subVar = `${ctrlVar}$router`;
  writer.writeLine(`const ${subVar} = new Hono();`);

  for (const route of metadata.routes) {
    writeRouteHandler(writer, subVar, ctrlVar, route, hasBodyValidation);
  }

  writer.writeLine(`router.route('${metadata.basePath}', ${subVar});`);
}

/**
 * Write a single route handler: `subRouter.get('/path', async (c) => { ... })`.
 */
function writeRouteHandler(
  writer: CodeBlockWriter,
  subRouterVar: string,
  ctrlVar: string,
  route: RouteMetadata,
  hasBodyValidation: boolean,
): void {
  const path = route.path.startsWith('/') ? route.path : `/${route.path}`;

  writer
    .write(
      `${subRouterVar}.${route.httpMethod}('${path}', async (c: Context) =>`,
    )
    .block(() => {
      writer.write('try').block(() => {
        const argExprs: string[] = [];
        for (const param of route.params) {
          const expr = generateParamExtraction(param, hasBodyValidation);
          if (expr.declaration) {
            writer.writeLine(expr.declaration);
          }
          argExprs.push(expr.argExpr);
        }

        const args = argExprs.join(', ');
        const defaultStatus = route.status !== 200 ? `, ${route.status}` : '';
        writer.writeLine(
          `return toHonoResponse(c, await ${ctrlVar}.${route.methodName}(${args})${defaultStatus});`,
        );
      });
      writer.write('catch (e)').block(() => {
        writer.writeLine('handleException(e, __exh);');
        writer.writeLine('throw e;');
      });
    });
  writer.write(');').newLine();
}

interface ControllerEntry {
  component: IRComponentDefinition;
  metadata: ControllerMetadata;
}

function findControllers(
  components: IRComponentDefinition[],
): ControllerEntry[] {
  const result: ControllerEntry[] = [];
  for (const component of components) {
    const httpCtrl = component.metadata.httpController as
      | ControllerMetadata
      | undefined;
    if (httpCtrl) {
      result.push({ component, metadata: httpCtrl });
    }
  }
  return result;
}

/**
 * Collect all unique body param types across all controllers.
 * Returns a Map of className → importPath for types that have a known import path.
 */
function collectBodyParamTypes(
  controllers: ControllerEntry[],
): Map<string, string> {
  const types = new Map<string, string>();
  for (const { metadata } of controllers) {
    for (const route of metadata.routes) {
      for (const param of route.params) {
        if (param.binding === 'body' && param.typeImportPath) {
          types.set(param.typeName, param.typeImportPath);
        }
      }
    }
  }
  return types;
}

interface ParamExtractionResult {
  declaration?: string;
  argExpr: string;
}

function generateParamExtraction(
  param: ParamMetadata,
  hasBodyValidation: boolean,
): ParamExtractionResult {
  switch (param.binding) {
    case 'path': {
      const raw = `c.req.param('${param.name}')`;
      const coercion = generateCoercion(raw, param.typeName);
      if (coercion === raw) {
        return { argExpr: coercion };
      }
      return {
        declaration: `const ${param.name} = ${coercion};`,
        argExpr: param.name,
      };
    }
    case 'query': {
      if (isArrayType(param.typeName)) {
        const elementType = param.typeName.slice(0, -2);
        const raw = `c.req.queries('${param.name}') ?? []`;
        const coercion = generateArrayCoercion(raw, elementType);
        return {
          declaration: `const ${param.name} = ${coercion};`,
          argExpr: param.name,
        };
      }
      const raw = `c.req.query('${param.name}')`;
      const coercion = generateCoercion(raw, param.typeName);
      if (coercion === raw) {
        return { argExpr: coercion };
      }
      return {
        declaration: `const ${param.name} = ${coercion};`,
        argExpr: param.name,
      };
    }
    case 'body': {
      if (hasBodyValidation && param.typeImportPath) {
        // Body param with known type — parse JSON, then validate via BodyValidator
        const rawVar = `__${param.name}Raw`;
        return {
          declaration:
            `const ${rawVar} = await c.req.json();\n` +
            `const ${param.name} = __bodyValidator ? await __bodyValidator.validate(${param.typeName}, ${rawVar}) : ${rawVar};`,
          argExpr: param.name,
        };
      }
      return {
        declaration: `const ${param.name} = await c.req.json();`,
        argExpr: param.name,
      };
    }
    case 'context':
      return { argExpr: 'buildHttpContext(c)' };
  }
}

function generateCoercion(expr: string, typeName: string): string {
  switch (typeName) {
    case 'number':
      return `Number(${expr})`;
    case 'boolean':
      return `${expr} === 'true'`;
    default:
      return expr;
  }
}

function generateArrayCoercion(expr: string, elementType: string): string {
  switch (elementType) {
    case 'number':
      return `(${expr}).map(Number)`;
    case 'boolean':
      return `(${expr}).map((v: string) => v === 'true')`;
    default:
      return expr;
  }
}

function isArrayType(typeName: string): boolean {
  return typeName.endsWith('[]');
}
