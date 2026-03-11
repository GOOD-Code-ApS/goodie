import type { InvocationContext } from '@goodie-ts/core';
import { MetadataRegistry } from '@goodie-ts/core';
import { ValiError } from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { ValiSchemaFactory } from '../src/vali-schema-factory.js';
import { ValidationInterceptor } from '../src/validation-interceptor.js';

class TodoRequest {
  title!: string;
}

class TestController {
  testMethod() {}
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
  paramTypes?: Array<new (...a: any[]) => unknown>,
  proceedResult: unknown = 'ok',
  paramIndex = 0,
): InvocationContext {
  if (paramTypes) {
    MetadataRegistry.INSTANCE.registerMethodParams(
      TestController,
      'testMethod',
      paramTypes,
      paramIndex,
    );
  }
  return {
    className: 'TestController',
    methodName: 'testMethod',
    args,
    target: new TestController(),
    proceed: () => proceedResult,
    metadata: {},
  };
}

describe('ValidationInterceptor', () => {
  it('proceeds without validation when no paramTypes registered', () => {
    const interceptor = createInterceptor();
    const ctx: InvocationContext = {
      className: 'TestController',
      methodName: 'testMethod',
      args: ['anything'],
      target: new TestController(),
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

  it('validates at correct paramIndex when body is not first arg', () => {
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

    // Valid — body at args[1] has valid title, paramIndex=1
    const validCtx = createContext(
      ['some-id', { title: 'hello' }],
      [TodoRequest],
      'ok',
      1,
    );
    expect(interceptor.intercept(validCtx)).toBe('ok');

    // Reset and re-register for the invalid test
    MetadataRegistry.INSTANCE.reset();
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

    // Invalid — body at args[1] has empty title, paramIndex=1
    const invalidCtx = createContext(
      ['some-id', { title: '' }],
      [TodoRequest],
      'ok',
      1,
    );
    expect(() => interceptor.intercept(invalidCtx)).toThrow(ValiError);
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

    MetadataRegistry.INSTANCE.registerMethodParams(
      TestController,
      'testMethod',
      [TodoRequest],
    );

    const interceptor = createInterceptor();
    let proceedCalled = false;
    const ctx: InvocationContext = {
      className: 'TestController',
      methodName: 'testMethod',
      args: [{ title: 'hello' }],
      target: new TestController(),
      proceed: () => {
        proceedCalled = true;
        return 'result';
      },
      metadata: {},
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

    MetadataRegistry.INSTANCE.registerMethodParams(
      TestController,
      'testMethod',
      [TodoRequest],
    );

    const interceptor = createInterceptor();
    let proceedCalled = false;
    const ctx: InvocationContext = {
      className: 'TestController',
      methodName: 'testMethod',
      args: [{ title: '' }],
      target: new TestController(),
      proceed: () => {
        proceedCalled = true;
        return 'result';
      },
      metadata: {},
    };

    expect(() => interceptor.intercept(ctx)).toThrow(ValiError);
    expect(proceedCalled).toBe(false);
  });
});
