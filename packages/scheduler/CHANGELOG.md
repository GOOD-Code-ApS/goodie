# @goodie-ts/scheduler

## 0.6.3

### Patch Changes

- Updated dependencies [80b76ad]
  - @goodie-ts/core@0.9.0

## 0.6.2

### Patch Changes

- Updated dependencies [ce2a7e9]
  - @goodie-ts/core@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0

## 0.6.0

### Minor Changes

- cc600d7: feat: add @goodie-ts/events and @goodie-ts/scheduler packages

  Events: ApplicationEventListener abstract class pattern with compile-time discovery, EventBus with sequential async dispatch and O(1) routing, EventPublisher injection token.

  Scheduler: @Scheduled decorator for cron/fixedRate/fixedDelay with compile-time discovery, overlap prevention, graceful shutdown, lifecycle integration.

  Core: ApplicationContext self-registration as a bean for constructor injection by framework services.

  Transformer: plugin system hooks (visitClass, visitMethod, beforeCodegen) for events and scheduler plugins.

### Patch Changes

- Updated dependencies [cc600d7]
- Updated dependencies [c77e195]
  - @goodie-ts/core@0.6.0
