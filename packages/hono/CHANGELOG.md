# @goodie-ts/hono

## 2.0.0

### Major Changes

- eb93812: Extract `@goodie-ts/http` as an abstract HTTP package from `@goodie-ts/hono`. Route decorators (`@Controller`, `@Get`, `@Post`, etc.), `Request<T>`, `Response<T>`, `RouteMetadata`, and `ExceptionHandler` now live in the framework-agnostic `@goodie-ts/http` package. `@goodie-ts/hono` is now a thin adapter layer.
- eb93812: Rename Java-isms to TS-native terminology. `BeanDefinition` → `ComponentDefinition`, `@Bean` → `@Component`, `getBean()` → `get()`, `getAll()` replaces bean collection methods, and similar renames throughout the API surface. This is a breaking change for all packages.
- eb93812: Unified `__generated__/` folder replaces per-package generated files. All generated code now lives in a single `__generated__/` directory with compile-time body validation for HTTP request types.

## 1.0.0

### Major Changes

- be45d51: Multi-runtime deployment support

  - **@goodie-ts/core**: Add `@RequestScoped` decorator and `RequestScopeManager` for per-request component instances via `AsyncLocalStorage`. `ApplicationContext` supports `scope: 'request'` with automatic proxy generation for singleton->request-scoped dependencies. Conditional component evaluation (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingComponent`) now happens at runtime in `ApplicationContext.create()` instead of at build time in the graph builder.
  - **@goodie-ts/transformer**: Add `@RequestScoped` to scanner, `@ConditionalOnProperty` `havingValue` support (single string or array matching), `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Config plugin now recognises `@RequestScoped` as a component decorator.
  - **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). When `server.runtime` is `'cloudflare'`, `app.onStart()` hook and `EmbeddedServer` import are omitted from codegen — use `createRouter(ctx)` directly. Request scope middleware auto-generated when request-scoped components are present. **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
  - **@goodie-ts/kysely**: **Breaking:** `KyselyDatabase` is now abstract with per-dialect implementations (`PostgresKyselyDatabase`, `MysqlKyselyDatabase`, `SqliteKyselyDatabase`, `NeonKyselyDatabase`, `PlanetscaleKyselyDatabase`, `LibsqlKyselyDatabase`, `D1KyselyDatabase`). Each dialect is conditionally activated via `@ConditionalOnProperty('datasource.dialect')`. Per-dialect `DatasourceConfig` classes replace the shared `DatasourceConfig`. `PoolConfig` is conditional on pooled dialects (postgres, mysql). `supportsReturning` moved from standalone function to abstract property on `KyselyDatabase`. `TransactionManager` reads `supportsReturning` from `KyselyProvider` instead of `Dialect` type. D1 dialect is `@RequestScoped` for Cloudflare Workers. Removed: `DatasourceConfig`, `ConnectionStringKyselyDatabase`, `supportsReturning()`, `CONNECTION_STRING_DIALECTS`, `validateDialect()`, `dialect-factory.ts`.
  - **@goodie-ts/cli**: Warn when `goodie generate --mode library` produces components but `package.json` is missing the `"goodie": { "components": "..." }` field. Silent when the field already exists or no components were produced.

- 8fc7032: Simplify application bootstrap: `await app.start()` is now the single entry point. The hono plugin registers an `onStart` hook to wire the router and start the HTTP server automatically. Generated route wiring now calls stable `@goodie-ts/hono` runtime helpers (`handleResult`, `securityMiddleware`, `validationMiddleware`, etc.) instead of raw Hono/hono-openapi APIs. `createGoodieTest()` now accepts a definitions factory function and supports custom fixtures derived from the ApplicationContext.

  **Breaking changes to generated code** (re-run `pnpm build` to regenerate):

  - `startServer()` removed — replaced by `await app.start()`
  - `createApp()` removed — replaced by `app.start()` which returns the `ApplicationContext`
  - `export { definitions }` removed — use `buildDefinitions()` instead

## 0.12.0

### Minor Changes

- f62c78e: feat: OpenAPI support via hono-openapi

  Route decorators (`@Get`, `@Post`, etc.) now accept an optional second argument with OpenAPI options (`DescribeRouteOptions`). When any route has OpenAPI options, the plugin generates `describeRoute()` middleware and mounts `openAPIRouteHandler()` on `/openapi.json`.

  - `OpenApiConfig` library component for title/version/description via `@ConfigurationProperties('openapi')`
  - Validation switched from `@hono/zod-validator` to `validator()` from `hono-openapi` — schemas automatically feed into the OpenAPI spec
  - New dependencies: `hono-openapi`, `@hono/standard-validator`
  - Removed dependency: `@hono/zod-validator`

## 0.11.0

### Minor Changes

- 60c7a23: refactor!: consolidate @goodie-ts/http and @goodie-ts/security into @goodie-ts/hono

  BREAKING CHANGES:

  - `@goodie-ts/http` package removed — import `Controller`, `Get`, `Post`, `Put`, `Delete`, `Patch` from `@goodie-ts/hono`
  - `@goodie-ts/security` package removed — import `Secured`, `Anonymous`, `SecurityProvider`, `SECURITY_PROVIDER`, `Principal`, `UnauthorizedError` from `@goodie-ts/hono`
  - `SecurityContext` and `getPrincipal()` removed — use `c.get('principal')` with `GoodieEnv` type instead
  - `HttpFilter` abstraction removed — security middleware is generated natively by the hono plugin using Hono's middleware API
  - `SecurityHttpFilter` removed — replaced by generated Hono-native security middleware
  - `SecurityInterceptor` removed — `@Secured` is now HTTP-only (no service-layer AOP enforcement)
  - `@Secured()` on service methods is no longer supported — use it on controllers only

### Patch Changes

- Updated dependencies [5190bce]
- Updated dependencies [5694dd0]
  - @goodie-ts/core@0.10.0

## 0.10.0

### Minor Changes

- 80b76ad: Add `@goodie-ts/security` package for declarative authentication and authorization. Introduces `@Secured()`, `@Anonymous()`, `SecurityProvider`, and `SecurityHttpFilter`.

  Add compile-time `DecoratorMetadata` infrastructure. The transformer records class and method decorators (with resolved import paths) on `IRComponentDefinition`. `HttpFilterContext` now carries `classDecorators` and `methodDecorators` arrays instead of runtime `Symbol.metadata`. The hono plugin generates static decorator metadata at build time — no runtime `Symbol.metadata` needed for security checks. `@Secured()` and `@Anonymous()` are compile-time markers (no-ops at runtime).

  `DecoratorEntry` type exported from `@goodie-ts/core`. `IRDecoratorEntry` and `methodDecorators` added to transformer IR.

  **Breaking:** All HTTP decorators (`@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`) are now compile-time no-ops — they no longer write to `Symbol.metadata`. `HTTP_META`, `HONO_META`, `ControllerMetadata`, and `RouteMetadata` exports removed. `HttpFilterContext.routeMetadata` replaced with `classDecorators`/`methodDecorators`. `@goodie-ts/hono` no longer re-exports decorators from `@goodie-ts/http` — import generic HTTP decorators (`@Controller`, `@Get`, `@Post`, etc.) from `@goodie-ts/http` directly. Only Hono-specific exports (`@Validate`, `@Cors`, `EmbeddedServer`, `ServerConfig`) remain in `@goodie-ts/hono`. `@Cors` moved from `@goodie-ts/http` to `@goodie-ts/hono` (tied to `hono/cors` middleware). At `0.x` semver, minor bumps may contain breaking changes.

### Patch Changes

- Updated dependencies [80b76ad]
  - @goodie-ts/http@0.2.0
  - @goodie-ts/core@0.9.0

## 0.9.0

### Minor Changes

- 601f0b0: Extract framework-agnostic HTTP abstractions into `@goodie-ts/http`. Moves `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Cors`, and metadata types out of `@goodie-ts/hono` into a new package. Adds `HttpFilter` interface and `HTTP_FILTER` injection token for generic middleware discovery. `@goodie-ts/hono` re-exports everything for backwards compatibility — no user code changes required.

  **Note:** Metadata symbol identity changed from `Symbol('goodie:hono:controller')` to `Symbol('goodie:http:controller')` (and similarly for routes). `HONO_META` is now an alias for `HTTP_META`. This is technically a breaking change, but the symbols are internal — user code does not read them directly. At `0.x` semver, minor bumps may contain breaking changes.

### Patch Changes

- Updated dependencies [601f0b0]
  - @goodie-ts/http@0.2.0

## 0.8.0

### Minor Changes

- 0c2a4ba: Add `@Cors()` decorator for compile-time CORS middleware generation. Can be applied at class level (all routes) or method level (specific routes). Method-level `@Cors` overrides class-level. The hono plugin emits Hono's `cors()` middleware from `hono/cors` in the generated code.
- 2c564dd: Generate RPC-compatible typed routes via method chaining. The hono plugin now chains route registrations (`new Hono().get(...).post(...)`) instead of separate statements, enabling TypeScript to infer the full route type. Exports `AppType` and `createClient(baseUrl)` for end-to-end type-safe client usage with Hono's `hc`.
- 4e7ae76: Remove `@Controller` from scanner's hardcoded decorator names. Plugins can now register classes as components via `ctx.registerComponent({ scope })` in their `visitClass` hook. The hono plugin uses this to register `@Controller` classes as singletons — the DI core no longer has any HTTP knowledge.

  **BREAKING:** `@Controller` is no longer recognized by the scanner without the hono plugin. Projects using `@Controller` must have `@goodie-ts/hono` installed (which was already required for route codegen).

### Patch Changes

- Updated dependencies [2002163]
  - @goodie-ts/core@0.8.1

## 0.7.0

### Minor Changes

- ce2a7e9: feat(hono)!: move controller scanning from transformer into hono plugin

  BREAKING CHANGE: Removed public exports from `@goodie-ts/transformer`:
  `IRControllerDefinition`, `IRRouteDefinition`, `IRRouteValidation`,
  `HttpMethod`, `ScannedController`, `ScannedRoute`, `ScannedValidation`.

  The transformer core no longer has any HTTP/controller knowledge beyond
  `@Controller` implying singleton registration. All route scanning
  (`@Get`, `@Post`, `@Validate`, etc.) now lives in the hono plugin's
  `visitClass`/`visitMethod` hooks, following the Micronaut pattern where
  HTTP processing is fully owned by the framework module.

- ce2a7e9: feat(hono): extract route codegen into hono plugin, add ServerConfig and configDir support

  - Move `createRouter()`/`startServer()` code generation from transformer core into `@goodie-ts/hono` plugin, auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }`
  - Add `ServerConfig` class with `@ConfigurationProperties('server')` for host/port configuration
  - Rewrite `EmbeddedServer` as a `@Singleton` with `ServerConfig` dependency (no longer synthesized in codegen)
  - Resolver now stores controller metadata on `component.metadata.controller` so plugins can read it
  - Remove `hono` peer dependency from `@goodie-ts/transformer` — no longer coupled
  - Add `configDir` option to `@goodie-ts/vite-plugin` for JSON config file support

### Patch Changes

- Updated dependencies [ce2a7e9]
  - @goodie-ts/core@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0

## 0.6.0

### Minor Changes

- 3b40073: feat(hono,transformer): request validation via @Validate

  - Add `@Validate({ json?, query?, param? })` decorator for controller methods
  - Scanner detects `@Validate`, extracts Zod schema references and import paths via ts-morph
  - Codegen emits `zValidator()` middleware from `@hono/zod-validator` before route handlers
  - Standard 400 error response with sanitized Zod issues on validation failure
  - `@hono/zod-validator` and `zod` added as optional peer dependencies
  - Hono example updated with Zod schemas for create/update todo validation

### Patch Changes

- Updated dependencies [cc600d7]
- Updated dependencies [c77e195]
  - @goodie-ts/core@0.6.0

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/core@0.5.1
  - @goodie-ts/transformer@0.5.1

## 0.4.0

### Minor Changes

- Add framework packages: logging, cache, config, resilience, and kysely.

  - **@goodie-ts/logging**: `@Log` decorator, `LoggerFactory` static API, `MDC` mapped diagnostic context
  - **@goodie-ts/cache**: `@Cacheable`, `@CacheEvict`, `@CachePut` with in-memory cache and stampede protection
  - **@goodie-ts/config**: `@ConfigurationProperties` for environment variable binding by prefix
  - **@goodie-ts/resilience**: `@Retryable`, `@CircuitBreaker`, `@Timeout` with exponential backoff and circuit breaker state machine
  - **@goodie-ts/kysely**: `@Transactional`, `@Migration`, `TransactionManager`, `CrudRepository`, `MigrationRunner`
  - **@goodie-ts/decorators**: Add `@Value`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`
  - **@goodie-ts/transformer**: Codegen import deduplication, plugin contribution import parsing
  - **@goodie-ts/aop**: Foundation for all interceptor-based packages

### Patch Changes

- Updated dependencies
  - @goodie-ts/core@0.4.0
  - @goodie-ts/transformer@0.4.0

## 0.3.0

### Minor Changes

- 5165e4c: Add @goodie-ts/hono for controller routing, @goodie-ts/aop for compile-time method interception, and expand the transformer plugin API with fine-grained hooks (visitClass, visitMethod, afterResolve, beforeCodegen, codegen).

### Patch Changes

- Updated dependencies [5165e4c]
  - @goodie-ts/core@0.3.0
