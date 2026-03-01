import type { BeanDefinition, BeanPostProcessor } from '@goodie-ts/core';
import { buildInterceptorChain } from './interceptor-chain.js';
import type {
  InterceptedMethodDescriptor,
  MethodInterceptor,
} from './types.js';

/**
 * BeanPostProcessor that wraps intercepted methods with interceptor chains.
 * Applied after @PostConstruct (in afterInit) so that constructors and init methods
 * run without interception.
 */
export class AopPostProcessor implements BeanPostProcessor {
  private interceptorCache = new Map<string, MethodInterceptor>();

  constructor(
    private resolveInterceptor: (className: string) => MethodInterceptor,
  ) {}

  afterInit<T>(bean: T, definition: BeanDefinition<T>): T {
    const interceptedMethods = definition.metadata.interceptedMethods as
      | InterceptedMethodDescriptor[]
      | undefined;

    if (!interceptedMethods || interceptedMethods.length === 0) {
      return bean;
    }

    const obj = bean as Record<string, unknown>;
    const className =
      typeof definition.token === 'function'
        ? definition.token.name
        : definition.token.description;

    for (const desc of interceptedMethods) {
      const originalMethod = obj[desc.methodName];
      if (typeof originalMethod !== 'function') continue;

      const interceptors = desc.interceptorTokenRefs.map((ref) => {
        const cached = this.interceptorCache.get(ref.className);
        if (cached) return cached;
        const interceptor = this.resolveInterceptor(ref.className);
        this.interceptorCache.set(ref.className, interceptor);
        return interceptor;
      });

      obj[desc.methodName] = buildInterceptorChain(
        interceptors,
        bean,
        className,
        desc.methodName,
        originalMethod.bind(bean) as (...args: unknown[]) => unknown,
      );
    }

    return bean;
  }
}
