import { ApplicationContext } from './application-context.js';
import type { BeanDefinition } from './bean-definition.js';

/**
 * Fluent builder for bootstrapping an ApplicationContext.
 *
 * Obtained via `Goodie.build(definitions)`. Call `.start()` to create
 * and initialize the context.
 */
export class GoodieBuilder {
  constructor(private readonly definitions: BeanDefinition[]) {}

  /** Build and start the ApplicationContext. */
  async start(): Promise<ApplicationContext> {
    return ApplicationContext.create(this.definitions);
  }
}

/**
 * Entry point for the Goodie framework.
 *
 * Usage (in generated code):
 * ```ts
 * export const app = Goodie.build(definitions)
 * const ctx = await app.start()
 * ```
 */
export class Goodie {
  private constructor() {}

  /** Create a builder pre-loaded with the given bean definitions. */
  static build(definitions: BeanDefinition[]): GoodieBuilder {
    return new GoodieBuilder(definitions);
  }
}
