import {
  type Constructor,
  DIError,
  type InjectionToken,
} from '@goodie-ts/core';

/** The types accepted by @MockDefinition as the target to override. */
type MockTarget = Constructor | InjectionToken<unknown> | string;

/**
 * Thrown when @MockDefinition metadata is missing or the target cannot be resolved.
 */
export class MockDefinitionError extends DIError {
  constructor(message: string) {
    super(message);
    this.name = 'MockDefinitionError';
  }
}

/**
 * Class decorator that marks a mock class with the production bean it replaces.
 *
 * Stores the target as a non-enumerable static property `__mockTarget` on
 * the decorated class. No Symbol.metadata is used.
 *
 * @param target - The Constructor, InjectionToken, or string description to override
 *
 * @example
 * ```ts
 * @MockDefinition(UserRepository)
 * class MockUserRepository { ... }
 *
 * @MockDefinition('Repository<User>')
 * class MockUserRepo { ... }
 * ```
 */
export function MockDefinition(target: MockTarget) {
  return (
    value: new (...args: any[]) => any,
    _context: ClassDecoratorContext,
  ) => {
    Object.defineProperty(value, '__mockTarget', {
      value: target,
      enumerable: false,
      configurable: true,
    });
  };
}

/**
 * Read the @MockDefinition target from a decorated class.
 * Returns `undefined` if the class has no @MockDefinition annotation.
 */
export function getMockTarget(cls: Constructor): MockTarget | undefined {
  return (cls as any).__mockTarget as MockTarget | undefined;
}
