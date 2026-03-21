import type { DecoratorMeta } from '@goodie-ts/core';
import type { GenericValidation } from 'valibot';
import * as v from 'valibot';
import { customConstraintRegistry } from './decorators/create-constraint.js';

/**
 * Map a decorator to Valibot validation actions.
 *
 * Shared between `schema-from-descriptors.ts` (compile-time pre-built schemas)
 * and `ValiSchemaFactory` (runtime lazy-built schemas) so that constraint
 * mappings are defined in exactly one place.
 *
 * Returns `undefined` for unrecognized decorators (e.g. `@Schema` for OpenAPI).
 */
export function constraintToActions(
  dec: DecoratorMeta,
): GenericValidation[] | undefined {
  const val = dec.args.value;

  switch (dec.name) {
    case 'MinLength':
      return [v.minLength(val as number)];
    case 'MaxLength':
      return [v.maxLength(val as number)];
    case 'Min':
      return [v.minValue(val as number)];
    case 'Max':
      return [v.maxValue(val as number)];
    case 'Pattern':
      return [v.regex(new RegExp(val as string))];
    case 'NotBlank':
      return [v.check((s: string) => s.trim().length > 0, 'Must not be blank')];
    case 'Email':
      return [v.email()];
    case 'Size': {
      const min = val as number;
      const max = dec.args.value2 as number;
      return [v.minLength(min), v.maxLength(max)];
    }
    default: {
      const validator = customConstraintRegistry.get(dec.name);
      if (validator) {
        return [v.check(validator, `Custom constraint '${dec.name}' failed`)];
      }
      return undefined;
    }
  }
}
