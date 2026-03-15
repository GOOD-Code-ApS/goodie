/**
 * @Anonymous() — exempts a method from class-level @Secured.
 *
 * Only meaningful when a class has @Secured at class level.
 * Methods decorated with @Anonymous() skip authorization checks.
 *
 * No-op at runtime — the security plugin captures this at compile time
 * and stores it in metadata.security.anonymousMethods.
 *
 * @example
 * @Secured('ADMIN')
 * @Singleton()
 * class AdminService {
 *   // Requires ADMIN role
 *   deleteUser(id: string) { ... }
 *
 *   // Open to all — no auth required
 *   @Anonymous()
 *   healthCheck() { ... }
 * }
 */
export function Anonymous(): (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void {
  return () => {};
}
