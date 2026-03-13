import type { IRBeanDefinition, SourceLocation, TokenRef } from './ir.js';
import type { ResolveResult } from './resolver.js';
import {
  AmbiguousProviderError,
  CircularDependencyError,
  findSimilarTokens,
  InvalidDecoratorUsageError,
  MissingProviderError,
} from './transformer-errors.js';

/** Reserved token name used internally by codegen for the config bean. */
const RESERVED_CONFIG_TOKEN = '__Goodie_Config';

/** Result of the graph builder stage. */
export interface GraphResult {
  /** Bean definitions in topological order (dependencies before dependents). */
  beans: IRBeanDefinition[];
  warnings: string[];
}

/**
 * Build a full dependency graph from resolved IR,
 * validate, and return beans in topological order.
 */
export function buildGraph(resolveResult: ResolveResult): GraphResult {
  const warnings: string[] = [...resolveResult.warnings];
  const allBeans: IRBeanDefinition[] = [...resolveResult.beans];

  // Guard: no user-defined bean may use the reserved config token name
  for (const bean of allBeans) {
    if (
      bean.tokenRef.kind === 'injection-token' &&
      bean.tokenRef.tokenName === RESERVED_CONFIG_TOKEN
    ) {
      throw new InvalidDecoratorUsageError(
        'Provides',
        `Token name "${RESERVED_CONFIG_TOKEN}" is reserved for internal use by the @Value system. Rename the @Provides method or use a different token name.`,
        bean.sourceLocation,
      );
    }
  }

  // Build name-based lookup for @Named → @Inject('name') matching
  resolveNamedQualifiers(allBeans, warnings);

  // Validate: at most one @Primary per base token
  validatePrimaryUniqueness(allBeans);

  // Validate: no missing providers (except optional)
  validateProviders(allBeans);

  // Topological sort with cycle detection
  const sorted = topoSort(allBeans);

  return { beans: sorted, warnings };
}

/**
 * Resolve @Inject('name') field deps by matching against @Named beans.
 * Rewrites the tokenRef on matching field injections.
 */
function resolveNamedQualifiers(
  beans: IRBeanDefinition[],
  _warnings: string[],
): void {
  // Build lookup: name → bean tokenRef
  const namedBeans = new Map<string, IRBeanDefinition[]>();
  for (const bean of beans) {
    if (bean.name) {
      const existing = namedBeans.get(bean.name) ?? [];
      existing.push(bean);
      namedBeans.set(bean.name, existing);
    }
  }

  // Rewrite field injection tokenRefs that reference a named qualifier
  for (const bean of beans) {
    for (const field of bean.fieldDeps) {
      if (field.tokenRef.kind !== 'injection-token') continue;

      const candidates = namedBeans.get(field.tokenRef.tokenName);
      if (candidates && candidates.length === 1) {
        field.tokenRef = candidates[0].tokenRef;
      } else if (candidates && candidates.length > 1) {
        const _ownerName =
          bean.tokenRef.kind === 'class'
            ? bean.tokenRef.className
            : bean.tokenRef.tokenName;
        throw new AmbiguousProviderError(
          field.tokenRef.tokenName,
          candidates.map((c) =>
            c.tokenRef.kind === 'class'
              ? c.tokenRef.className
              : c.tokenRef.tokenName,
          ),
          bean.sourceLocation,
        );
      }
    }
  }
}

/**
 * Validate that at most one bean is marked @Primary per base token.
 * Multiple @Primary beans under the same base token is ambiguous.
 */
function validatePrimaryUniqueness(beans: IRBeanDefinition[]): void {
  // Group @Primary beans by their token refs — checks both the direct token
  // (e.g. two @Primary beans with the same class/injection token) and base
  // token refs (e.g. both implement CacheProvider).
  const primaryByToken = new Map<string, IRBeanDefinition[]>();

  for (const bean of beans) {
    if (!bean.primary) continue;

    // Register under the direct token
    const directKey = tokenRefKey(bean.tokenRef);
    const directExisting = primaryByToken.get(directKey) ?? [];
    directExisting.push(bean);
    primaryByToken.set(directKey, directExisting);

    // Register under each base token
    if (bean.baseTokenRefs) {
      for (const ref of bean.baseTokenRefs) {
        const key = tokenRefKey(ref);
        const existing = primaryByToken.get(key) ?? [];
        existing.push(bean);
        primaryByToken.set(key, existing);
      }
    }
  }

  for (const [_key, primaries] of primaryByToken) {
    if (primaries.length > 1) {
      throw new AmbiguousProviderError(
        '@Primary',
        primaries.map((b) =>
          b.tokenRef.kind === 'class'
            ? b.tokenRef.className
            : b.tokenRef.tokenName,
        ),
        primaries[0].sourceLocation,
        `Also declared @Primary at ${formatLocation(primaries[1].sourceLocation)}`,
      );
    }
  }
}

/** Validate that all required dependencies have a registered provider. */
function validateProviders(beans: IRBeanDefinition[]): void {
  const registered = new Set<string>();
  const registeredNames: string[] = [];
  for (const bean of beans) {
    registered.add(tokenRefKey(bean.tokenRef));
    registeredNames.push(tokenRefDisplayName(bean.tokenRef));
    if (bean.baseTokenRefs) {
      for (const ref of bean.baseTokenRefs) {
        registered.add(tokenRefKey(ref));
      }
    }
  }

  // Well-known tokens always available at runtime (self-registered by ApplicationContext).
  // Register both the bare package path and a className-only sentinel so library builds
  // (which use absolute file paths before rewriting) also pass validation.
  registered.add('class:@goodie-ts/core:ApplicationContext');
  registered.add('well-known:ApplicationContext');
  registeredNames.push('ApplicationContext');

  function buildHint(_depKey: string, depName: string): string | undefined {
    const similar = findSimilarTokens(depName, registeredNames);
    if (similar.length > 0) {
      return `Did you mean: ${similar.join(', ')}?`;
    }
    return undefined;
  }

  // Validate all required deps have providers
  for (const bean of beans) {
    const ownerName =
      bean.tokenRef.kind === 'class'
        ? bean.tokenRef.className
        : bean.tokenRef.tokenName;

    for (const dep of bean.constructorDeps) {
      if (dep.optional || dep.collection) continue;
      const key = tokenRefKey(dep.tokenRef);
      const wellKnownKey =
        dep.tokenRef.kind === 'class'
          ? `well-known:${dep.tokenRef.className}`
          : undefined;
      if (
        !registered.has(key) &&
        !(wellKnownKey && registered.has(wellKnownKey))
      ) {
        const depName =
          dep.tokenRef.kind === 'class'
            ? dep.tokenRef.className
            : dep.tokenRef.tokenName;
        throw new MissingProviderError(
          depName,
          ownerName,
          dep.sourceLocation,
          buildHint(key, depName),
        );
      }
    }

    for (const field of bean.fieldDeps) {
      if (field.optional) continue;
      const key = tokenRefKey(field.tokenRef);
      const wellKnownKey =
        field.tokenRef.kind === 'class'
          ? `well-known:${field.tokenRef.className}`
          : undefined;
      if (
        !registered.has(key) &&
        !(wellKnownKey && registered.has(wellKnownKey))
      ) {
        const depName =
          field.tokenRef.kind === 'class'
            ? field.tokenRef.className
            : field.tokenRef.tokenName;
        throw new MissingProviderError(
          depName,
          ownerName,
          bean.sourceLocation,
          buildHint(key, depName),
        );
      }
    }

    // Validate interceptor dependencies from AOP metadata
    for (const interceptorDep of getInterceptorDependencies(bean)) {
      const key = tokenRefKey(interceptorDep.tokenRef);
      if (!registered.has(key)) {
        const depName =
          interceptorDep.tokenRef.kind === 'class'
            ? interceptorDep.tokenRef.className
            : interceptorDep.tokenRef.tokenName;
        throw new MissingProviderError(
          depName,
          ownerName,
          bean.sourceLocation,
          buildHint(key, depName),
        );
      }
    }
  }
}

// ── Topological sort with source-location-enriched cycle errors ──

function topoSort(beans: IRBeanDefinition[]): IRBeanDefinition[] {
  // Map tokenRef key → bean definition
  const beanMap = new Map<string, IRBeanDefinition>();
  for (const bean of beans) {
    beanMap.set(tokenRefKey(bean.tokenRef), bean);
  }

  const sorted: IRBeanDefinition[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const pathStack: string[] = [];

  function visit(bean: IRBeanDefinition): void {
    const key = tokenRefKey(bean.tokenRef);
    if (visited.has(key)) return;

    if (visiting.has(key)) {
      // Cycle detected — build the cycle path from the current stack
      const name = tokenRefDisplayName(bean.tokenRef);
      const cycleStart = pathStack.indexOf(name);
      const cyclePath = [...pathStack.slice(cycleStart), name];
      throw new CircularDependencyError(cyclePath, bean.sourceLocation);
    }

    visiting.add(key);
    pathStack.push(tokenRefDisplayName(bean.tokenRef));

    // Visit all dependencies
    for (const dep of getAllDependencies(bean)) {
      const depKey = tokenRefKey(dep.tokenRef);
      const depBean = beanMap.get(depKey);
      if (depBean) {
        visit(depBean);
      }
      // Missing optional deps are already validated — skip silently
    }

    pathStack.pop();
    visiting.delete(key);
    visited.add(key);
    sorted.push(bean);
  }

  for (const bean of beans) {
    visit(bean);
  }

  return sorted;
}

/** Get all dependencies of a bean (constructor + field + interceptor). */
function* getAllDependencies(
  bean: IRBeanDefinition,
): Generator<{ tokenRef: TokenRef }> {
  yield* bean.constructorDeps;
  for (const f of bean.fieldDeps) yield { tokenRef: f.tokenRef };
  yield* getInterceptorDependencies(bean);
}

/**
 * Extract unique interceptor class dependencies from bean metadata.
 * Returns ClassTokenRef objects that the graph validator and topo sort can use.
 */
function getInterceptorDependencies(
  bean: IRBeanDefinition,
): Array<{ tokenRef: TokenRef }> {
  const interceptedMethods = bean.metadata.interceptedMethods as
    | Array<{
        methodName: string;
        interceptors: Array<{
          className: string;
          importPath: string;
          adviceType: string;
          order: number;
        }>;
      }>
    | undefined;
  if (!interceptedMethods || interceptedMethods.length === 0) return [];

  const seen = new Set<string>();
  const deps: Array<{ tokenRef: TokenRef }> = [];

  for (const method of interceptedMethods) {
    for (const ref of method.interceptors) {
      const key = `${ref.importPath}:${ref.className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deps.push({
        tokenRef: {
          kind: 'class',
          className: ref.className,
          importPath: ref.importPath,
        },
      });
    }
  }

  return deps;
}

/** Stable key for a TokenRef for use in Maps/Sets. */
function tokenRefKey(ref: TokenRef): string {
  if (ref.kind === 'class') {
    return `class:${ref.importPath}:${ref.className}`;
  }
  return `token:${ref.tokenName}:${ref.importPath ?? ''}`;
}

function tokenRefDisplayName(ref: TokenRef): string {
  if (ref.kind === 'class') return ref.className;
  return ref.tokenName;
}

function formatLocation(loc: SourceLocation): string {
  return `${loc.filePath}:${loc.line}:${loc.column}`;
}
