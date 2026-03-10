import { Response } from '@goodie-ts/http';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ValiValidationErrorMapper } from '../src/vali-validation-error-mapper.js';

function createMapper(): ValiValidationErrorMapper {
  return new (ValiValidationErrorMapper as any)();
}

describe('ValiValidationErrorMapper', () => {
  it('maps ValiError to 400 response with error details', () => {
    const mapper = createMapper();
    const schema = v.object({
      title: v.pipe(v.string(), v.minLength(1)),
    });

    let error: unknown;
    try {
      v.parse(schema, { title: '' });
    } catch (e) {
      error = e;
    }

    const result = mapper.tryMap(error);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(400);

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].path).toBe('title');
    expect(body.errors[0].message).toBeDefined();
  });

  it('returns undefined for non-ValiError', () => {
    const mapper = createMapper();

    expect(mapper.tryMap(new Error('something'))).toBeUndefined();
    expect(mapper.tryMap('string')).toBeUndefined();
    expect(mapper.tryMap(null)).toBeUndefined();
  });

  it('handles nested path errors', () => {
    const mapper = createMapper();
    const schema = v.object({
      address: v.object({
        city: v.pipe(v.string(), v.minLength(1)),
      }),
    });

    let error: unknown;
    try {
      v.parse(schema, { address: { city: '' } });
    } catch (e) {
      error = e;
    }

    const result = mapper.tryMap(error);
    expect(result).toBeDefined();

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors[0].path).toBe('address.city');
  });

  it('handles multiple validation errors', () => {
    const mapper = createMapper();
    const schema = v.object({
      name: v.string(),
      age: v.number(),
    });

    let error: unknown;
    try {
      v.parse(schema, { name: 123, age: 'not a number' });
    } catch (e) {
      error = e;
    }

    const result = mapper.tryMap(error);
    expect(result).toBeDefined();

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
  });
});
