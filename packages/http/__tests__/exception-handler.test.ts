import { describe, expect, it } from 'vitest';
import {
  ExceptionHandler,
  handleException,
  MappedException,
} from '../src/exception-handler.js';
import { Response } from '../src/response.js';

class NotFoundHandler extends ExceptionHandler {
  handle(error: unknown): Response | undefined {
    if (error instanceof Error && error.message === 'not found') {
      return Response.status(404, { message: 'Not found' });
    }
    return undefined;
  }
}

class ValidationHandler extends ExceptionHandler {
  handle(error: unknown): Response | undefined {
    if (error instanceof Error && error.message.startsWith('validation:')) {
      return Response.status(400, { message: error.message });
    }
    return undefined;
  }
}

describe('handleException', () => {
  it('does nothing when no handlers are registered', () => {
    expect(() => handleException(new Error('oops'), [])).not.toThrow();
  });

  it('does nothing when no handler matches', () => {
    expect(() =>
      handleException(new Error('oops'), [new NotFoundHandler()]),
    ).not.toThrow();
  });

  it('throws MappedException when a handler matches', () => {
    expect(() =>
      handleException(new Error('not found'), [new NotFoundHandler()]),
    ).toThrow(MappedException);
  });

  it('MappedException carries the response from the handler', () => {
    try {
      handleException(new Error('not found'), [new NotFoundHandler()]);
    } catch (e) {
      expect(e).toBeInstanceOf(MappedException);
      const mapped = e as MappedException;
      expect(mapped.response).toBeInstanceOf(Response);
      expect(mapped.response.status).toBe(404);
      expect((mapped.response.body as { message: string }).message).toBe(
        'Not found',
      );
      return;
    }
    expect.fail('Expected MappedException to be thrown');
  });

  it('uses the first matching handler', () => {
    try {
      handleException(new Error('not found'), [
        new ValidationHandler(),
        new NotFoundHandler(),
      ]);
    } catch (e) {
      const mapped = e as MappedException;
      // ValidationHandler doesn't match, NotFoundHandler does
      expect(mapped.response.status).toBe(404);
      return;
    }
    expect.fail('Expected MappedException to be thrown');
  });

  it('supports multiple exception handlers for different error types', () => {
    const handlers = [new NotFoundHandler(), new ValidationHandler()];

    expect(() => handleException(new Error('not found'), handlers)).toThrow(
      MappedException,
    );

    expect(() =>
      handleException(new Error('validation: field required'), handlers),
    ).toThrow(MappedException);

    expect(() =>
      handleException(new Error('server crash'), handlers),
    ).not.toThrow();
  });
});
