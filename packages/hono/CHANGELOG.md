# @goodie-ts/hono

## 0.8.0

### Minor Changes

- 0c2a4ba: Add `@Cors()` decorator for compile-time CORS middleware generation. Can be applied at class level (all routes) or method level (specific routes). Method-level `@Cors` overrides class-level. The hono plugin emits Hono's `cors()` middleware from `hono/cors` in the generated code.
- 2c564dd: Generate RPC-compatible typed routes via method chaining. The hono plugin now chains route registrations (`new Hono().get(...).post(...)`) instead of separate statements, enabling TypeScript to infer the full route type. Exports `AppType` and `createClient(baseUrl)` for end-to-end type-safe client usage with Hono's `hc`.
- 4e7ae76: Remove `@Controller` from scanner's hardcoded decorator names. Plugins can now register classes as beans via `ctx.registerBean({ scope })` in their `visitClass` hook. The hono plugin uses this to register `@Controller` classes as singletons — the DI core no longer has any HTTP knowledge.

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
  - Resolver now stores controller metadata on `bean.metadata.controller` so plugins can read it
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
