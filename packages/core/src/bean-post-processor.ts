import type { BeanDefinition } from './bean-definition.js';

/**
 * Hook called by ApplicationContext after every bean is created.
 * Extension libraries (AOP, validation, caching, etc.) implement this.
 */
export interface BeanPostProcessor {
  /** Called before init. Can return a replacement instance. */
  beforeInit?<T>(bean: T, definition: BeanDefinition<T>): T | Promise<T>;
  /** Called after init. Can return a replacement instance. */
  afterInit?<T>(bean: T, definition: BeanDefinition<T>): T | Promise<T>;
}
