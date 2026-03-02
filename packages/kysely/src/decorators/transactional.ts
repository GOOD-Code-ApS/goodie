export interface TransactionalOptions {
  /** Transaction propagation strategy (default: 'REQUIRED'). */
  propagation?: 'REQUIRED' | 'REQUIRES_NEW';
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Mark a method to run inside a database transaction.
 *
 * At compile time, the kysely transformer plugin reads this decorator
 * and wires the `TransactionalInterceptor` via AOP.
 *
 * @param opts - Optional configuration (e.g. propagation strategy).
 */
export function Transactional(
  _opts?: TransactionalOptions,
): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: read at compile time by the kysely transformer plugin
  };
}
