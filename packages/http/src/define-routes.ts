import type { InjectionToken } from '@goodie-ts/core';
import { RouteDefinition } from './route-definition.js';
import { RouterBuilder } from './router-builder.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = unknown> = new (...args: any[]) => T;

type TokenType<T> =
  T extends Constructor<infer U>
    ? U
    : T extends InjectionToken<infer U>
      ? U
      : never;

type DepsMap = Record<string, Constructor | InjectionToken<unknown>>;

type ResolvedDeps<T extends DepsMap> = {
  [K in keyof T]: TokenType<T[K]>;
};

/**
 * Descriptor returned by `defineRoutes()`. The transformer reads `__deps` to generate
 * a `BeanDefinition` with the correct dependencies. At runtime, the generated factory
 * calls `__build()` with resolved dependencies to produce a `RouteDefinition`.
 */
export interface RouteDefinitionDescriptor<TDeps extends DepsMap> {
  readonly __deps: TDeps;
  readonly __builder: (
    resolved: ResolvedDeps<TDeps>,
  ) => (router: RouterBuilder) => void;
  __build(resolvedDeps: ResolvedDeps<TDeps>): RouteDefinition;
}

/**
 * Define routes with explicit dependencies and a functional builder.
 *
 * The transformer scans `defineRoutes()` calls, extracts the dependency token map,
 * and generates a `BeanDefinition` that resolves dependencies from the container.
 *
 * @example
 * ```typescript
 * export const todoRoutes = defineRoutes({
 *   todoService: TodoService,
 * }, (deps) => (router) => {
 *   router.get('/todos', async (req) => {
 *     return Response.ok(await deps.todoService.findAll());
 *   });
 *
 *   router.post('/todos', validated(CreateTodoDto), async (req) => {
 *     return Response.created(await deps.todoService.create(req.body));
 *   });
 * });
 * ```
 */
export function defineRoutes<TDeps extends DepsMap>(
  deps: TDeps,
  builder: (resolved: ResolvedDeps<TDeps>) => (router: RouterBuilder) => void,
): RouteDefinitionDescriptor<TDeps> {
  return {
    __deps: deps,
    __builder: builder,
    __build(resolvedDeps: ResolvedDeps<TDeps>): RouteDefinition {
      const rb = new RouterBuilder();
      builder(resolvedDeps)(rb);
      return new RouteDefinition(rb.getEntries());
    },
  };
}
