import type { IRComponentDefinition, SourceLocation, TokenRef } from './ir.js';
import type { ResolveResult } from './resolver.js';
import {
  AmbiguousProviderError,
  CircularDependencyError,
  findSimilarTokens,
  InvalidDecoratorUsageError,
  MissingProviderError,
} from './transformer-errors.js';

/** Reserved token name used internally by codegen for the config component. */
const RESERVED_CONFIG_TOKEN = '__Goodie_Config';

/** Result of the graph builder stage. */
export interface GraphResult {
  /** Component definitions in topological order (dependencies before dependents). */
  components: IRComponentDefinition[];
  warnings: string[];
}

/**
 * Build a full dependency graph from resolved IR,
 * validate, and return components in topological order.
 */
export function buildGraph(resolveResult: ResolveResult): GraphResult {
  const warnings: string[] = [...resolveResult.warnings];
  const allComponents: IRComponentDefinition[] = [...resolveResult.components];

  // Guard: no user-defined component may use the reserved config token name
  for (const component of allComponents) {
    if (
      component.tokenRef.kind === 'injection-token' &&
      component.tokenRef.tokenName === RESERVED_CONFIG_TOKEN
    ) {
      throw new InvalidDecoratorUsageError(
        'Provides',
        `Token name "${RESERVED_CONFIG_TOKEN}" is reserved for internal use by the @Value system. Rename the @Provides method or use a different token name.`,
        component.sourceLocation,
      );
    }
  }

  // Build name-based lookup for @Named → @Inject('name') matching
  resolveNamedQualifiers(allComponents, warnings);

  // Validate: at most one @Primary per base token
  validatePrimaryUniqueness(allComponents);

  // Validate: no missing providers (except optional)
  validateProviders(allComponents);

  // Topological sort with cycle detection
  const sorted = topoSort(allComponents);

  return { components: sorted, warnings };
}

/**
 * Resolve @Inject('name') field deps by matching against @Named components.
 * Rewrites the tokenRef on matching field injections.
 */
function resolveNamedQualifiers(
  components: IRComponentDefinition[],
  _warnings: string[],
): void {
  // Build lookup: name → component tokenRef
  const namedComponents = new Map<string, IRComponentDefinition[]>();
  for (const component of components) {
    if (component.name) {
      const existing = namedComponents.get(component.name) ?? [];
      existing.push(component);
      namedComponents.set(component.name, existing);
    }
  }

  // Rewrite field injection tokenRefs that reference a named qualifier
  for (const component of components) {
    for (const field of component.fieldDeps) {
      if (field.tokenRef.kind !== 'injection-token') continue;

      const candidates = namedComponents.get(field.tokenRef.tokenName);
      if (candidates && candidates.length === 1) {
        field.tokenRef = candidates[0].tokenRef;
      } else if (candidates && candidates.length > 1) {
        const _ownerName =
          component.tokenRef.kind === 'class'
            ? component.tokenRef.className
            : component.tokenRef.tokenName;
        throw new AmbiguousProviderError(
          field.tokenRef.tokenName,
          candidates.map((c) =>
            c.tokenRef.kind === 'class'
              ? c.tokenRef.className
              : c.tokenRef.tokenName,
          ),
          component.sourceLocation,
        );
      }
    }
  }
}

/**
 * Validate that at most one component is marked @Primary per base token.
 * Multiple @Primary components under the same base token is ambiguous.
 */
function validatePrimaryUniqueness(components: IRComponentDefinition[]): void {
  // Group @Primary components by their token refs — checks both the direct token
  // (e.g. two @Primary components with the same class/injection token) and base
  // token refs (e.g. both implement CacheProvider).
  const primaryByToken = new Map<string, IRComponentDefinition[]>();

  for (const component of components) {
    if (!component.primary) continue;

    // Register under the direct token
    const directKey = tokenRefKey(component.tokenRef);
    const directExisting = primaryByToken.get(directKey) ?? [];
    directExisting.push(component);
    primaryByToken.set(directKey, directExisting);

    // Register under each base token
    if (component.baseTokenRefs) {
      for (const ref of component.baseTokenRefs) {
        const key = tokenRefKey(ref);
        const existing = primaryByToken.get(key) ?? [];
        existing.push(component);
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
function validateProviders(components: IRComponentDefinition[]): void {
  const registered = new Set<string>();
  const registeredNames: string[] = [];
  for (const component of components) {
    registered.add(tokenRefKey(component.tokenRef));
    registeredNames.push(tokenRefDisplayName(component.tokenRef));
    if (component.baseTokenRefs) {
      for (const ref of component.baseTokenRefs) {
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
  for (const component of components) {
    const ownerName =
      component.tokenRef.kind === 'class'
        ? component.tokenRef.className
        : component.tokenRef.tokenName;

    for (const dep of component.constructorDeps) {
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

    for (const field of component.fieldDeps) {
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
          component.sourceLocation,
          buildHint(key, depName),
        );
      }
    }

    // Validate interceptor dependencies from AOP metadata
    for (const interceptorDep of getInterceptorDependencies(component)) {
      const key = tokenRefKey(interceptorDep.tokenRef);
      if (!registered.has(key)) {
        const depName =
          interceptorDep.tokenRef.kind === 'class'
            ? interceptorDep.tokenRef.className
            : interceptorDep.tokenRef.tokenName;
        throw new MissingProviderError(
          depName,
          ownerName,
          component.sourceLocation,
          buildHint(key, depName),
        );
      }
    }
  }
}

// ── Topological sort with source-location-enriched cycle errors ──

function topoSort(
  components: IRComponentDefinition[],
): IRComponentDefinition[] {
  // Map tokenRef key → component definition
  const componentMap = new Map<string, IRComponentDefinition>();
  for (const component of components) {
    componentMap.set(tokenRefKey(component.tokenRef), component);
  }

  const sorted: IRComponentDefinition[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const pathStack: string[] = [];

  function visit(component: IRComponentDefinition): void {
    const key = tokenRefKey(component.tokenRef);
    if (visited.has(key)) return;

    if (visiting.has(key)) {
      // Cycle detected — build the cycle path from the current stack
      const name = tokenRefDisplayName(component.tokenRef);
      const cycleStart = pathStack.indexOf(name);
      const cyclePath = [...pathStack.slice(cycleStart), name];
      throw new CircularDependencyError(cyclePath, component.sourceLocation);
    }

    visiting.add(key);
    pathStack.push(tokenRefDisplayName(component.tokenRef));

    // Visit all dependencies
    for (const dep of getAllDependencies(component)) {
      const depKey = tokenRefKey(dep.tokenRef);
      const depComponent = componentMap.get(depKey);
      if (depComponent) {
        visit(depComponent);
      }
      // Missing optional deps are already validated — skip silently
    }

    pathStack.pop();
    visiting.delete(key);
    visited.add(key);
    sorted.push(component);
  }

  for (const component of components) {
    visit(component);
  }

  return sorted;
}

/** Get all dependencies of a component (constructor + field + interceptor). */
function* getAllDependencies(
  component: IRComponentDefinition,
): Generator<{ tokenRef: TokenRef }> {
  yield* component.constructorDeps;
  for (const f of component.fieldDeps) yield { tokenRef: f.tokenRef };
  yield* getInterceptorDependencies(component);
}

/**
 * Extract unique interceptor class dependencies from component metadata.
 * Returns ClassTokenRef objects that the graph validator and topo sort can use.
 */
function getInterceptorDependencies(
  component: IRComponentDefinition,
): Array<{ tokenRef: TokenRef }> {
  const interceptedMethods = component.metadata.interceptedMethods as
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
