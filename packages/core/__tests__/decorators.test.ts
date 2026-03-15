import {
  Eager,
  Factory,
  Inject,
  InjectionToken,
  Named,
  OnDestroy,
  OnInit,
  Optional,
  PostProcessor,
  Provides,
  Singleton,
  Transient,
  Value,
} from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';

/**
 * All core decorators are compile-time-only no-ops.
 * The transformer reads them via AST inspection at build time.
 * These tests verify that applying decorators does not throw.
 */

describe('@Transient()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Transient()
      class _Foo {}
    }).not.toThrow();
  });
});

describe('@Singleton()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Singleton()
      class _Foo {}
    }).not.toThrow();
  });
});

describe('@Named()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Named('primary')
      @Singleton()
      class _Foo {}
    }).not.toThrow();
  });
});

describe('@Eager()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Eager()
      @Singleton()
      class _Foo {}
    }).not.toThrow();
  });
});

describe('@Factory()', () => {
  it('is a no-op that does not throw with no options', () => {
    expect(() => {
      @Factory()
      class _AppModule {}
    }).not.toThrow();
  });

  it('is a no-op that does not throw with imports', () => {
    @Factory()
    class DbModule {}

    expect(() => {
      @Factory({ imports: [DbModule] })
      class _AppModule {}
    }).not.toThrow();
  });
});

describe('@Provides()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Factory()
      class _AppModule {
        @Provides()
        dbUrl(): string {
          return 'postgres://localhost';
        }

        @Provides()
        apiKey(): string {
          return 'secret';
        }
      }
    }).not.toThrow();
  });
});

describe('@Inject()', () => {
  it('is a no-op that does not throw with string qualifier', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @Inject('primary')
        accessor repo: unknown = undefined;
      }
    }).not.toThrow();
  });

  it('is a no-op that does not throw with InjectionToken', () => {
    const DB_URL = new InjectionToken<string>('DB_URL');

    expect(() => {
      @Singleton()
      class _Service {
        @Inject(DB_URL)
        accessor url: string = '';
      }
    }).not.toThrow();
  });
});

describe('@Optional()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @Optional()
        accessor tracer: unknown = undefined;
      }
    }).not.toThrow();
  });
});

describe('@OnDestroy()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Singleton()
      class _Pool {
        @OnDestroy()
        shutdown() {}
      }
    }).not.toThrow();
  });

  it('supports multiple @OnDestroy methods', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @OnDestroy()
        closeConnections() {}

        @OnDestroy()
        flushBuffers() {}
      }
    }).not.toThrow();
  });
});

describe('@OnInit()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @OnInit()
        init() {}
      }
    }).not.toThrow();
  });

  it('supports multiple @OnInit methods', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @OnInit()
        initCache() {}

        @OnInit()
        loadConfig() {}
      }
    }).not.toThrow();
  });
});

describe('@PostProcessor()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @PostProcessor()
      @Singleton()
      class _LoggingBPP {}
    }).not.toThrow();
  });
});

describe('@Value()', () => {
  it('is a no-op that does not throw', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @Value('DB_URL')
        accessor dbUrl: string = '';
      }
    }).not.toThrow();
  });

  it('is a no-op with default value option', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @Value('PORT', { default: 3000 })
        accessor port: number = 0;
      }
    }).not.toThrow();
  });

  it('supports multiple @Value fields', () => {
    expect(() => {
      @Singleton()
      class _Service {
        @Value('DB_URL')
        accessor dbUrl: string = '';

        @Value('PORT')
        accessor port: number = 0;
      }
    }).not.toThrow();
  });
});

describe('combined decorators', () => {
  it('multiple decorators coexist on the same class without throwing', () => {
    expect(() => {
      @Named('main')
      @Eager()
      @Singleton()
      class _Service {
        @Inject('primary')
        accessor repo: unknown = undefined;

        @Optional()
        accessor logger: unknown = undefined;
      }
    }).not.toThrow();
  });
});
