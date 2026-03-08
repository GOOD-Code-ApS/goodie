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
});
