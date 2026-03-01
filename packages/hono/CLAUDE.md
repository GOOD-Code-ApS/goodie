# @goodie-ts/hono

HTTP controller decorators that attach route metadata via `Symbol.metadata`. At build time, the transformer scans these to generate a `createRouter()` function — the decorators do NOT register routes at runtime.

## Key Files

| File | Role |
|------|------|
| `src/metadata.ts` | `HONO_META` symbol keys, `ControllerMetadata`, `RouteMetadata` types |
| `src/controller.ts` | `@Controller(basePath?)` — marks class as HTTP controller, stores basePath |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — method decorators via `createRouteDecorator()` |
| `src/index.ts` | Public exports |

## HONO_META Keys (metadata.ts)

All are Symbols under the `HONO_META` object:
- `CONTROLLER` — `ControllerMetadata` (`{ basePath }`)
- `ROUTES` — `RouteMetadata[]` (`{ method, path, methodName }`)

## Relationship to Transformer

The transformer (`packages/transformer`) does the heavy lifting:
- **Scanner** (`scanner.ts`): Detects `@Controller` classes and `@Get`/`@Post`/etc. methods by decorator name. Controllers are implicitly registered as singleton beans.
- **IR** (`ir.ts`): `IRControllerDefinition` and `IRRouteDefinition` carry controller data through the pipeline.
- **Codegen** (`codegen.ts`): `generateCreateRouter()` emits a `createRouter(ctx: ApplicationContext): Hono` function that retrieves controllers from the container and registers routes.

## Design Decisions

- **`@Controller` implies singleton** — cannot combine with `@Singleton`, `@Injectable`, or `@Module` (throws `InvalidDecoratorUsageError`)
- **Methods receive Hono `Context` directly** — no parameter decorator magic (Stage 3 has no param decorators)
- **Return value conventions**: `Response` passthrough, `undefined`/`null` returns 204, everything else is `c.json(result)`
- **Stage 3 decorator types**: Uses custom `ClassDecorator_Stage3` and `MethodDecorator_Stage3` types (not legacy `ClassDecorator`/`MethodDecorator`)

## Gotchas

- Route decorators are matched by name only (no import source verification), but only scanned on `@Controller` classes
- `hono` is a peer dependency of the transformer (for codegen), not a direct dependency of this package at build time
- Controller variable names in generated code use collision-safe naming (`className:importPath` keying)
