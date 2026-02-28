import { InjectionToken } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import {
  Eager,
  getClassMetadata,
  Inject,
  Injectable,
  META,
  Module,
  Named,
  Optional,
  PostConstruct,
  PostProcessor,
  PreDestroy,
  Provides,
  Singleton,
  Value,
} from '../src/index.js';

// Polyfill for test environment
Symbol.metadata ??= Symbol('Symbol.metadata');

describe('@Injectable()', () => {
  it('sets scope to prototype', () => {
    @Injectable()
    class Foo {}

    const meta = getClassMetadata(Foo)!;
    expect(meta[META.SCOPE]).toBe('prototype');
  });
});

describe('@Singleton()', () => {
  it('sets scope to singleton', () => {
    @Singleton()
    class Foo {}

    const meta = getClassMetadata(Foo)!;
    expect(meta[META.SCOPE]).toBe('singleton');
  });
});

describe('@Named()', () => {
  it('sets the qualifier name', () => {
    @Named('primary')
    @Singleton()
    class Foo {}

    const meta = getClassMetadata(Foo)!;
    expect(meta[META.NAME]).toBe('primary');
  });
});

describe('@Eager()', () => {
  it('sets eager flag to true', () => {
    @Eager()
    @Singleton()
    class Foo {}

    const meta = getClassMetadata(Foo)!;
    expect(meta[META.EAGER]).toBe(true);
  });
});

describe('@Module()', () => {
  it('stores module metadata with empty imports by default', () => {
    @Module()
    class AppModule {}

    const meta = getClassMetadata(AppModule)!;
    expect(meta[META.MODULE]).toEqual({ imports: [] });
  });

  it('stores module metadata with imports', () => {
    @Module()
    class DbModule {}

    @Module({ imports: [DbModule] })
    class AppModule {}

    const meta = getClassMetadata(AppModule)!;
    const modMeta = meta[META.MODULE] as { imports: unknown[] };
    expect(modMeta.imports).toEqual([DbModule]);
  });
});

describe('@Provides()', () => {
  it('records the method name in provides array', () => {
    @Module()
    class AppModule {
      @Provides()
      dbUrl(): string {
        return 'postgres://localhost';
      }

      @Provides()
      apiKey(): string {
        return 'secret';
      }
    }

    const meta = getClassMetadata(AppModule)!;
    const provides = meta[META.PROVIDES] as Array<{ methodName: string }>;
    expect(provides).toHaveLength(2);
    expect(provides[0].methodName).toBe('dbUrl');
    expect(provides[1].methodName).toBe('apiKey');
  });
});

describe('@Inject()', () => {
  it('records field injection with string qualifier', () => {
    @Singleton()
    class Service {
      @Inject('primary')
      accessor repo: unknown = undefined;
    }

    const meta = getClassMetadata(Service)!;
    const injects = meta[META.INJECT] as Array<{
      fieldName: string;
      qualifier: string;
    }>;
    expect(injects).toHaveLength(1);
    expect(injects[0].fieldName).toBe('repo');
    expect(injects[0].qualifier).toBe('primary');
  });

  it('records field injection with InjectionToken', () => {
    const DB_URL = new InjectionToken<string>('DB_URL');

    @Singleton()
    class Service {
      @Inject(DB_URL)
      accessor url: string = '';
    }

    const meta = getClassMetadata(Service)!;
    const injects = meta[META.INJECT] as Array<{
      fieldName: string;
      qualifier: InjectionToken<string>;
    }>;
    expect(injects[0].qualifier).toBe(DB_URL);
  });
});

describe('@Optional()', () => {
  it('records the optional field name', () => {
    @Singleton()
    class Service {
      @Optional()
      accessor tracer: unknown = undefined;
    }

    const meta = getClassMetadata(Service)!;
    const optionals = meta[META.OPTIONAL] as Array<{ fieldName: string }>;
    expect(optionals).toHaveLength(1);
    expect(optionals[0].fieldName).toBe('tracer');
  });
});

describe('@PreDestroy()', () => {
  it('records the method name in pre-destroy array', () => {
    @Singleton()
    class Pool {
      @PreDestroy()
      shutdown() {}
    }

    const meta = getClassMetadata(Pool)!;
    const preDestroy = meta[META.PRE_DESTROY] as Array<{
      methodName: string;
    }>;
    expect(preDestroy).toHaveLength(1);
    expect(preDestroy[0].methodName).toBe('shutdown');
  });

  it('records multiple @PreDestroy methods', () => {
    @Singleton()
    class Service {
      @PreDestroy()
      closeConnections() {}

      @PreDestroy()
      flushBuffers() {}
    }

    const meta = getClassMetadata(Service)!;
    const preDestroy = meta[META.PRE_DESTROY] as Array<{
      methodName: string;
    }>;
    expect(preDestroy).toHaveLength(2);
    expect(preDestroy[0].methodName).toBe('closeConnections');
    expect(preDestroy[1].methodName).toBe('flushBuffers');
  });
});

describe('@PostConstruct()', () => {
  it('records the method name in post-construct array', () => {
    @Singleton()
    class Service {
      @PostConstruct()
      init() {}
    }

    const meta = getClassMetadata(Service)!;
    const postConstruct = meta[META.POST_CONSTRUCT] as Array<{
      methodName: string;
    }>;
    expect(postConstruct).toHaveLength(1);
    expect(postConstruct[0].methodName).toBe('init');
  });

  it('records multiple @PostConstruct methods', () => {
    @Singleton()
    class Service {
      @PostConstruct()
      initCache() {}

      @PostConstruct()
      loadConfig() {}
    }

    const meta = getClassMetadata(Service)!;
    const postConstruct = meta[META.POST_CONSTRUCT] as Array<{
      methodName: string;
    }>;
    expect(postConstruct).toHaveLength(2);
    expect(postConstruct[0].methodName).toBe('initCache');
    expect(postConstruct[1].methodName).toBe('loadConfig');
  });
});

describe('@PostProcessor()', () => {
  it('sets POST_PROCESSOR to true', () => {
    @PostProcessor()
    @Singleton()
    class LoggingBPP {}

    const meta = getClassMetadata(LoggingBPP)!;
    expect(meta[META.POST_PROCESSOR]).toBe(true);
  });
});

describe('@Value()', () => {
  it('records the field name and config key', () => {
    @Singleton()
    class Service {
      @Value('DB_URL')
      accessor dbUrl: string = '';
    }

    const meta = getClassMetadata(Service)!;
    const values = meta[META.VALUE] as Array<{
      fieldName: string;
      key: string;
    }>;
    expect(values).toHaveLength(1);
    expect(values[0].fieldName).toBe('dbUrl');
    expect(values[0].key).toBe('DB_URL');
  });

  it('records default value when provided', () => {
    @Singleton()
    class Service {
      @Value('PORT', { default: 3000 })
      accessor port: number = 0;
    }

    const meta = getClassMetadata(Service)!;
    const values = meta[META.VALUE] as Array<{
      fieldName: string;
      key: string;
      default: unknown;
    }>;
    expect(values).toHaveLength(1);
    expect(values[0].key).toBe('PORT');
    expect(values[0].default).toBe(3000);
  });

  it('records multiple @Value fields', () => {
    @Singleton()
    class Service {
      @Value('DB_URL')
      accessor dbUrl: string = '';

      @Value('PORT')
      accessor port: number = 0;
    }

    const meta = getClassMetadata(Service)!;
    const values = meta[META.VALUE] as Array<{
      fieldName: string;
      key: string;
    }>;
    expect(values).toHaveLength(2);
    expect(values[0].key).toBe('DB_URL');
    expect(values[1].key).toBe('PORT');
  });
});

describe('combined decorators', () => {
  it('multiple decorators coexist on the same class', () => {
    @Named('main')
    @Eager()
    @Singleton()
    class Service {
      @Inject('primary')
      accessor repo: unknown = undefined;

      @Optional()
      accessor logger: unknown = undefined;
    }

    const meta = getClassMetadata(Service)!;
    expect(meta[META.SCOPE]).toBe('singleton');
    expect(meta[META.NAME]).toBe('main');
    expect(meta[META.EAGER]).toBe(true);
    expect(meta[META.INJECT]).toHaveLength(1);
    expect(meta[META.OPTIONAL]).toHaveLength(1);
  });
});
