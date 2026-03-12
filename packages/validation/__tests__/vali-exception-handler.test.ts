import { Response } from '@goodie-ts/http';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ValiExceptionHandler } from '../src/vali-exception-handler.js';

function createHandler(): ValiExceptionHandler {
  return new (ValiExceptionHandler as any)();
}

describe('ValiExceptionHandler', () => {
  it('maps ValiError to 400 response with error details', () => {
    const handler = createHandler();
    const schema = v.object({
      title: v.pipe(v.string(), v.minLength(1)),
    });

    let error: unknown;
    try {
      v.parse(schema, { title: '' });
    } catch (e) {
      error = e;
    }

    const result = handler.handle(error);
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
    const handler = createHandler();

    expect(handler.handle(new Error('something'))).toBeUndefined();
    expect(handler.handle('string')).toBeUndefined();
    expect(handler.handle(null)).toBeUndefined();
  });

  it('handles nested path errors', () => {
    const handler = createHandler();
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

    const result = handler.handle(error);
    expect(result).toBeDefined();

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors[0].path).toBe('address.city');
  });

  it('returns empty string path for root-level validation errors', () => {
    const handler = createHandler();
    const schema = v.pipe(v.string(), v.minLength(1));

    let error: unknown;
    try {
      v.parse(schema, '');
    } catch (e) {
      error = e;
    }

    const result = handler.handle(error);
    expect(result).toBeDefined();
    expect(result!.status).toBe(400);

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].path).toBe('');
    expect(body.errors[0].message).toBeDefined();
  });

  it('handles multiple validation errors', () => {
    const handler = createHandler();
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

    const result = handler.handle(error);
    expect(result).toBeDefined();

    const body = result!.body as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
  });
});
