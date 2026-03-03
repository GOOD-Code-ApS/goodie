import type {
  CodegenContribution,
  IRBeanDefinition,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/** Internal tracking of cache annotations found during method visiting. */
interface CacheMethodInfo {
  methodName: string;
  cacheName: string;
  cacheAction: 'get' | 'evict' | 'put';
  ttlMs?: number;
  allEntries?: boolean;
}

const CACHE_DECORATORS: Record<string, 'get' | 'evict' | 'put'> = {
  Cacheable: 'get',
  CacheEvict: 'evict',
  CachePut: 'put',
};

/**
 * Create the cache transformer plugin.
 *
 * Scans @Cacheable, @CacheEvict, and @CachePut decorators on methods
 * and wires CacheInterceptor as an AOP interceptor dependency at compile time.
 */
export function createCachePlugin(): TransformerPlugin {
  const classCacheInfo = new Map<string, CacheMethodInfo[]>();

  return {
    name: 'cache',

    beforeScan(): void {
      classCacheInfo.clear();
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const decorators = ctx.methodDeclaration.getDecorators();

      for (const decorator of decorators) {
        const decoratorName = decorator.getName();
        const cacheAction = CACHE_DECORATORS[decoratorName];
        if (!cacheAction) continue;

        // First argument is always the cache name string
        const args = decorator.getArguments();
        if (args.length === 0) continue;

        const cacheNameText = args[0].getText();
        // Strip quotes: 'todos' or "todos" → todos
        const cacheName = cacheNameText.replace(/^['"]|['"]$/g, '');

        // Parse options from second argument
        let ttlMs: number | undefined;
        let allEntries: boolean | undefined;

        if (args.length > 1) {
          const optsText = args[1].getText();

          // Parse TTL (Cacheable and CachePut only) — only literal numbers are supported
          if (cacheAction === 'get' || cacheAction === 'put') {
            const ttlMatch = optsText.match(/ttlMs\s*:\s*(\d+)/);
            if (ttlMatch) {
              ttlMs = Number.parseInt(ttlMatch[1], 10);
            }
          }

          // Parse allEntries (CacheEvict only)
          if (cacheAction === 'evict') {
            const allEntriesMatch = optsText.match(
              /allEntries\s*:\s*(true|false)/,
            );
            if (allEntriesMatch) {
              allEntries = allEntriesMatch[1] === 'true';
            }
          }
        }

        const key = `${ctx.filePath}:${ctx.className}`;
        const existing = classCacheInfo.get(key) ?? [];
        existing.push({
          methodName: ctx.methodName,
          cacheName,
          cacheAction,
          ttlMs,
          allEntries,
        });
        classCacheInfo.set(key, existing);
      }
    },

    afterResolve(beans: IRBeanDefinition[]): IRBeanDefinition[] {
      let needsInterceptor = false;

      for (const bean of beans) {
        const className =
          bean.tokenRef.kind === 'class' ? bean.tokenRef.className : undefined;
        if (!className) continue;

        const key = `${bean.tokenRef.importPath}:${className}`;
        const cacheInfos = classCacheInfo.get(key);
        if (!cacheInfos || cacheInfos.length === 0) continue;

        needsInterceptor = true;

        const existing = (bean.metadata.interceptedMethods ?? []) as Array<{
          methodName: string;
          interceptors: Array<{
            className: string;
            importPath: string;
            adviceType: string;
            order: number;
            metadata?: Record<string, unknown>;
          }>;
        }>;

        for (const info of cacheInfos) {
          const methodEntry = existing.find(
            (m) => m.methodName === info.methodName,
          );

          const interceptorRef = {
            className: 'CacheInterceptor',
            importPath: '@goodie-ts/cache',
            adviceType: 'around' as const,
            order: -50, // Cache runs after logging (-100) but before other interceptors
            metadata: {
              cacheName: info.cacheName,
              cacheAction: info.cacheAction,
              ...(info.ttlMs !== undefined ? { ttlMs: info.ttlMs } : {}),
              ...(info.allEntries ? { allEntries: true } : {}),
            },
          };

          if (methodEntry) {
            methodEntry.interceptors.push(interceptorRef);
          } else {
            existing.push({
              methodName: info.methodName,
              interceptors: [interceptorRef],
            });
          }
        }

        bean.metadata.interceptedMethods = existing;
      }

      if (!needsInterceptor) return beans;

      // Check if synthetic beans already exist (e.g. plugin invoked multiple times)
      const alreadyHas = beans.some(
        (b) =>
          b.tokenRef.kind === 'class' &&
          b.tokenRef.className === 'CacheInterceptor' &&
          b.tokenRef.importPath === '@goodie-ts/cache',
      );
      if (alreadyHas) return beans;

      // Add synthetic CacheInterceptor bean (depends on CacheManager)
      const cacheInterceptorBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'CacheInterceptor',
          importPath: '@goodie-ts/cache',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [
          {
            tokenRef: {
              kind: 'class',
              className: 'CacheManager',
              importPath: '@goodie-ts/cache',
            },
            optional: false,
            collection: false,
            sourceLocation: {
              filePath: '@goodie-ts/cache',
              line: 0,
              column: 0,
            },
          },
        ],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@goodie-ts/cache', line: 0, column: 0 },
      };

      // Add synthetic CacheManager bean (no deps)
      const cacheManagerBean: IRBeanDefinition = {
        tokenRef: {
          kind: 'class',
          className: 'CacheManager',
          importPath: '@goodie-ts/cache',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: { filePath: '@goodie-ts/cache', line: 0, column: 0 },
      };

      return [...beans, cacheManagerBean, cacheInterceptorBean];
    },

    codegen(beans: IRBeanDefinition[]): CodegenContribution {
      const hasCaching = beans.some((b) => {
        const methods = b.metadata.interceptedMethods as
          | Array<{
              interceptors: Array<{ className: string }>;
            }>
          | undefined;
        return methods?.some((m) =>
          m.interceptors.some((i) => i.className === 'CacheInterceptor'),
        );
      });

      if (!hasCaching) return {};

      return {
        imports: [
          "import { CacheInterceptor, CacheManager } from '@goodie-ts/cache'",
          "import { buildInterceptorChain } from '@goodie-ts/aop'",
        ],
      };
    },
  };
}
