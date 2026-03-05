# @goodie-ts/kysely

## 1.0.0

### Patch Changes

- cc600d7: fix: move @goodie-ts/\* runtime dependencies to peerDependencies

  Library packages now declare @goodie-ts/\* runtime dependencies as peerDependencies
  instead of dependencies. This ensures consumers share a single copy of core packages
  like @goodie-ts/core, preventing class identity mismatches at runtime.

  Build-time tools (cli, vite-plugin, transformer) are unchanged since they don't share
  a runtime with the consumer's application.

- Updated dependencies [cc600d7]
  - @goodie-ts/aop@1.0.0

## 0.5.2

### Patch Changes

- Updated dependencies [9f7daed]
  - @goodie-ts/aop@0.6.0

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/transformer@0.5.1
  - @goodie-ts/aop@0.5.1

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
  - @goodie-ts/transformer@0.4.0
  - @goodie-ts/aop@0.4.0
