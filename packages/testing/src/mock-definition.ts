import { type Constructor, DIError, type InjectionToken } from '@goodie/core';

/** Well-known metadata key for @MockDefinition target. */
const MOCK_TARGET = Symbol('goodie:mock-target');

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
    _value: new (...args: any[]) => any,
    context: ClassDecoratorContext,
  ) => {
    (context.metadata as Record<PropertyKey, unknown>)[MOCK_TARGET] = target;
  };
}

/**
 * Read the @MockDefinition target from a decorated class.
 * Returns `undefined` if the class has no @MockDefinition annotation.
 */
export function getMockTarget(cls: Constructor): MockTarget | undefined {
  const metadata = (
    cls as unknown as { [Symbol.metadata]?: Record<PropertyKey, unknown> }
  )[Symbol.metadata];
  return metadata?.[MOCK_TARGET] as MockTarget | undefined;
}
