import { describe, expect, it } from 'vitest';
import { createTestProject } from './helpers.js';

describe('@RequestScoped', () => {
  it('should generate a bean with scope: request', () => {
    const result = createTestProject({
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'

        @RequestScoped()
        export class MyService {
          value = 'hello'
        }
      `,
    });

    expect(result.code).toContain("scope: 'request'");
    expect(result.code).toContain('MyService');
  });

  it('should not mark request-scoped beans as eager', () => {
    const result = createTestProject({
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'

        @RequestScoped()
        export class MyService {}
      `,
    });

    expect(result.code).toContain('eager: false');
  });

  it('should support constructor dependencies on request-scoped beans', () => {
    const result = createTestProject({
      '/src/dep.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class DepService {}
      `,
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'
        import { DepService } from './dep.js'

        @RequestScoped()
        export class MyService {
          constructor(public dep: DepService) {}
        }
      `,
    });

    expect(result.code).toContain("scope: 'request'");
    expect(result.code).toContain('token: DepService');
  });

  it('should generate a compile-time scoped proxy factory for request-scoped beans with getters', () => {
    const result = createTestProject({
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'

        @RequestScoped()
        export class MyService {
          get value(): string { return 'hello' }
          greet(): string { return this.value }
        }
      `,
    });

    // Should generate a proxy factory function
    expect(result.code).toContain(
      'function __MyService$scopedProxy(resolve: () => any)',
    );
    expect(result.code).toContain('Object.create(MyService.prototype');
    // Getter delegation
    expect(result.code).toContain(
      'value: { get() { return resolve().value }, configurable: true }',
    );
    // Method delegation with bind
    expect(result.code).toContain(
      'greet: { get() { const t = resolve(); return t.greet.bind(t) }, configurable: true }',
    );
    // Proxy factory wired into metadata
    expect(result.code).toContain(
      'scopedProxyFactory: __MyService$scopedProxy',
    );
  });

  it('should not generate scoped proxy for request-scoped beans with no public members', () => {
    const result = createTestProject({
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'

        @RequestScoped()
        export class MyService {
          private _value = 'hello'
        }
      `,
    });

    expect(result.code).not.toContain('$scopedProxy');
  });

  it('should include plain public fields in scoped proxy', () => {
    const result = createTestProject({
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'

        @RequestScoped()
        export class MyService {
          value = 'default'
          name = 'test'
          private _internal = 'hidden'
        }
      `,
    });

    expect(result.code).toContain('function __MyService$scopedProxy');
    // Plain public fields should be included as property delegation
    expect(result.code).toContain(
      'value: { get() { return resolve().value }, configurable: true }',
    );
    expect(result.code).toContain(
      'name: { get() { return resolve().name }, configurable: true }',
    );
    // Private field should NOT be included
    expect(result.code).not.toContain('_internal');
  });

  it('should extract members from parent class for scoped proxy', () => {
    const result = createTestProject({
      '/src/base.ts': `
        export abstract class BaseService {
          abstract get name(): string
          describe(): string { return this.name }
        }
      `,
      '/src/my-service.ts': `
        import { RequestScoped } from './decorators.js'
        import { BaseService } from './base.js'

        @RequestScoped()
        export class MyService extends BaseService {
          get name(): string { return 'test' }
        }
      `,
    });

    expect(result.code).toContain('function __MyService$scopedProxy');
    // Should include both own getter and inherited method
    expect(result.code).toContain('name:');
    expect(result.code).toContain('describe:');
  });
});
