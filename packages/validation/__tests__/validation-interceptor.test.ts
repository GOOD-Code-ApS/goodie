import type { InvocationContext } from '@goodie-ts/core';
import { MetadataRegistry } from '@goodie-ts/core';
import { Request } from '@goodie-ts/http';
import { ValiError } from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { ValiSchemaFactory } from '../src/vali-schema-factory.js';
import { ValidationInterceptor } from '../src/validation-interceptor.js';

class TodoRequest {
  title!: string;
}

afterEach(() => {
  MetadataRegistry.INSTANCE.reset();
});

function createInterceptor(): ValidationInterceptor {
  const factory = new (ValiSchemaFactory as any)();
  return new (ValidationInterceptor as any)(factory);
}

function createContext(
  args: unknown[],
  paramTypes: Array<new (...a: any[]) => unknown>,
  proceedResult: unknown = 'ok',
): InvocationContext {
  return {
    className: 'TestClass',
    methodName: 'testMethod',
    args,
    target: {},
    proceed: () => proceedResult,
    metadata: { paramTypes },
  };
}

describe('ValidationInterceptor', () => {
  it('proceeds without validation when no paramTypes metadata', () => {
    const interceptor = createInterceptor();
    const ctx: InvocationContext = {
      className: 'TestClass',
      methodName: 'testMethod',
      args: ['anything'],
      target: {},
      proceed: () => 'ok',
      metadata: undefined,
    };

    expect(interceptor.intercept(ctx)).toBe('ok');
  });

  it('proceeds without validation when param type is not introspected', () => {
    const interceptor = createInterceptor();
    const ctx = createContext([{ title: 'hello' }], [TodoRequest]);

    // TodoRequest is NOT registered in MetadataRegistry → skip validation
    expect(interceptor.intercept(ctx)).toBe('ok');
  });

  it('validates plain object args against introspection schema', () => {
    MetadataRegistry.INSTANCE.register({
      type: TodoRequest,
      className: 'TodoRequest',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'MinLength', args: { value: 1 } }],
        },
      ],
    });

    const interceptor = createInterceptor();

    // Valid
    const validCtx = createContext([{ title: 'hello' }], [TodoRequest]);
    expect(interceptor.intercept(validCtx)).toBe('ok');

    // Invalid — empty title
    const invalidCtx = createContext([{ title: '' }], [TodoRequest]);
    expect(() => interceptor.intercept(invalidCtx)).toThrow(ValiError);
  });

  it('validates Request<T>.body against introspection schema for T', () => {
    MetadataRegistry.INSTANCE.register({
      type: TodoRequest,
      className: 'TodoRequest',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'MinLength', args: { value: 1 } }],
        },
      ],
    });

    const interceptor = createInterceptor();

    // Valid Request<T>
    const validReq = new Request({ body: { title: 'hello' } });
    const validCtx = createContext([validReq], [TodoRequest]);
    expect(interceptor.intercept(validCtx)).toBe('ok');

    // Invalid Request<T> — empty title
    const invalidReq = new Request({ body: { title: '' } });
    const invalidCtx = createContext([invalidReq], [TodoRequest]);
    expect(() => interceptor.intercept(invalidCtx)).toThrow(ValiError);
  });

  it('skips null/undefined args', () => {
    MetadataRegistry.INSTANCE.register({
      type: TodoRequest,
      className: 'TodoRequest',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    const interceptor = createInterceptor();
    const ctx = createContext([undefined], [TodoRequest]);

    expect(interceptor.intercept(ctx)).toBe('ok');
  });

  it('calls proceed after successful validation', () => {
    MetadataRegistry.INSTANCE.register({
      type: TodoRequest,
      className: 'TodoRequest',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    const interceptor = createInterceptor();
    let proceedCalled = false;
    const ctx: InvocationContext = {
      className: 'TestClass',
      methodName: 'testMethod',
      args: [{ title: 'hello' }],
      target: {},
      proceed: () => {
        proceedCalled = true;
        return 'result';
      },
      metadata: { paramTypes: [TodoRequest] },
    };

    expect(interceptor.intercept(ctx)).toBe('result');
    expect(proceedCalled).toBe(true);
  });

  it('does not call proceed when validation fails', () => {
    MetadataRegistry.INSTANCE.register({
      type: TodoRequest,
      className: 'TodoRequest',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'MinLength', args: { value: 1 } }],
        },
      ],
    });

    const interceptor = createInterceptor();
    let proceedCalled = false;
    const ctx: InvocationContext = {
      className: 'TestClass',
      methodName: 'testMethod',
      args: [{ title: '' }],
      target: {},
      proceed: () => {
        proceedCalled = true;
        return 'result';
      },
      metadata: { paramTypes: [TodoRequest] },
    };

    expect(() => interceptor.intercept(ctx)).toThrow(ValiError);
    expect(proceedCalled).toBe(false);
  });
});
