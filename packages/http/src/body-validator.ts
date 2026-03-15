/**
 * Abstract body validator. Concrete implementations live in their
 * respective packages (e.g. `ValiBodyValidator` in `@goodie-ts/validation`).
 *
 * When present in the DI context, adapter plugins (e.g. Hono) call
 * `validate()` on parsed request bodies before passing them to controller
 * methods. If no `BodyValidator` is registered, bodies pass through
 * unvalidated.
 *
 * Follows the same pattern as `ExceptionHandler` — abstract class in the
 * HTTP abstraction, concrete implementation via library component with
 * `baseTokens: [BodyValidator]`.
 */
export abstract class BodyValidator {
  /**
   * Validate a parsed request body against the expected type.
   *
   * @param type - The class constructor of the expected body type
   * @param body - The parsed JSON body
   * @returns The validated body (may be the same object or a transformed copy)
   * @throws If validation fails (e.g. ValiError from Valibot)
   */
  abstract validate<T>(
    type: new (...args: any[]) => T,
    body: unknown,
  ): T | Promise<T>;
}
