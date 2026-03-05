# @goodie-ts/scheduler

## 1.0.0

### Minor Changes

- cc600d7: feat: add @goodie-ts/events and @goodie-ts/scheduler packages

  Events: ApplicationEventListener abstract class pattern with compile-time discovery, EventBus with sequential async dispatch and O(1) routing, EventPublisher injection token.

  Scheduler: @Scheduled decorator for cron/fixedRate/fixedDelay with compile-time discovery, overlap prevention, graceful shutdown, lifecycle integration.

  Core: ApplicationContext self-registration as a bean for constructor injection by framework services.

  Transformer: plugin system hooks (visitClass, visitMethod, beforeCodegen) for events and scheduler plugins.

### Patch Changes

- cc600d7: fix: move @goodie-ts/\* runtime dependencies to peerDependencies

  Library packages now declare @goodie-ts/\* runtime dependencies as peerDependencies
  instead of dependencies. This ensures consumers share a single copy of core packages
  like @goodie-ts/core, preventing class identity mismatches at runtime.

  Build-time tools (cli, vite-plugin, transformer) are unchanged since they don't share
  a runtime with the consumer's application.

- Updated dependencies [cc600d7]
- Updated dependencies [c77e195]
  - @goodie-ts/core@0.6.0
