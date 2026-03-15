import type { ComponentDefinition } from './component-definition.js';

/**
 * Hook called by ApplicationContext after every component is created.
 * Extension libraries (AOP, validation, caching, etc.) implement this.
 */
export interface ComponentPostProcessor {
  /** Called before init. Can return a replacement instance. */
  beforeInit?<T>(
    component: T,
    definition: ComponentDefinition<T>,
  ): T | Promise<T>;
  /** Called after init. Can return a replacement instance. */
  afterInit?<T>(
    component: T,
    definition: ComponentDefinition<T>,
  ): T | Promise<T>;
}
