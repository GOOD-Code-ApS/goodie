import type {
  IRBeanDefinition,
  IRDependency,
  IRModule,
  TokenRef,
} from './ir.js';
import type { ResolveResult } from './resolver.js';
import {
  AmbiguousProviderError,
  CircularDependencyError,
  MissingProviderError,
} from './transformer-errors.js';

/** Result of the graph builder stage. */
export interface GraphResult {
  /** Bean definitions in topological order (dependencies before dependents). */
  beans: IRBeanDefinition[];
  warnings: string[];
}

/**
 * Build a full dependency graph from resolved IR, expand modules,
 * validate, and return beans in topological order.
 */
export function buildGraph(resolveResult: ResolveResult): GraphResult {
  const warnings: string[] = [...resolveResult.warnings];
  const allBeans: IRBeanDefinition[] = [...resolveResult.beans];

  // Expand modules: register the module class itself + each @Provides as a bean
  const processedModules = new Set<string>();
  expandModules(resolveResult.modules, allBeans, processedModules);

  // Build name-based lookup for @Named → @Inject('name') matching
  resolveNamedQualifiers(allBeans, warnings);

  // Validate: no missing providers (except optional)
  validateProviders(allBeans);

  // Topological sort with cycle detection
  const sorted = topoSort(allBeans);

  return { beans: sorted, warnings };
}

/**
 * Recursively expand modules: register the module class as a singleton,
 * and each @Provides method as a separate bean.
 * Handles transitive imports (A imports B, B imports C) with cycle detection.
 */
function expandModules(
  modules: IRModule[],
  allBeans: IRBeanDefinition[],
  processed: Set<string>,
): void {
  // Build a lookup map: tokenRefKey → IRModule (for transitive resolution)
  const moduleLookup = new Map<string, IRModule>();
  for (const mod of modules) {
    moduleLookup.set(tokenRefKey(mod.classTokenRef), mod);
  }

  const visiting = new Set<string>(); // cycle detection

  function expandModule(mod: IRModule): void {
    const key = tokenRefKey(mod.classTokenRef);
    if (processed.has(key)) return; // already expanded (handles diamond imports)

    if (visiting.has(key)) {
      throw new CircularDependencyError(
        [...visiting, tokenRefDisplayName(mod.classTokenRef)],
        mod.sourceLocation,
      );
    }

    visiting.add(key);

    // Recursively expand imported modules first
    for (const importRef of mod.imports) {
      const importKey = tokenRefKey(importRef);
      const importedModule = moduleLookup.get(importKey);
      if (importedModule) {
        expandModule(importedModule);
      }
      // Non-module imports are silently ignored (they may be regular beans)
    }

    visiting.delete(key);
    processed.add(key);

    // Register the module class itself as an implicit singleton
    allBeans.push({
      tokenRef: mod.classTokenRef,
      scope: 'singleton',
      eager: false,
      name: undefined,
      constructorDeps: [],
      fieldDeps: [],
      factoryKind: 'constructor',
      providesSource: undefined,
      metadata: { isModule: true },
      sourceLocation: mod.sourceLocation,
    });

    // Register each @Provides method as a separate bean
    for (const provides of mod.provides) {
      // Module instance is the implicit first dependency
      const moduleDep: IRDependency = {
        tokenRef: mod.classTokenRef,
        optional: false,
        collection: false,
        sourceLocation: provides.sourceLocation,
      };

      allBeans.push({
        tokenRef: provides.tokenRef,
        scope: provides.scope,
        eager: provides.eager,
        name: undefined,
        constructorDeps: [moduleDep, ...provides.dependencies],
        fieldDeps: [],
        factoryKind: 'provides',
        providesSource: {
          moduleTokenRef: mod.classTokenRef,
          methodName: provides.methodName,
        },
        metadata: {},
        sourceLocation: provides.sourceLocation,
      });
    }
  }

  for (const mod of modules) {
    expandModule(mod);
  }
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

/** Validate that all required dependencies have a registered provider. */
function validateProviders(beans: IRBeanDefinition[]): void {
  const registered = new Set<string>();
  for (const bean of beans) {
    registered.add(tokenRefKey(bean.tokenRef));
  }

  // Build subtype map: baseTokenKey → subtypes (beans that extend that base class)
  // Uses all ancestors, so C extends B extends A produces entries for both B→[C] and A→[C]
  const subtypeMap = new Map<string, IRBeanDefinition[]>();
  for (const bean of beans) {
    if (bean.baseTokenRefs) {
      for (const baseRef of bean.baseTokenRefs) {
        const baseKey = tokenRefKey(baseRef);
        const existing = subtypeMap.get(baseKey) ?? [];
        existing.push(bean);
        subtypeMap.set(baseKey, existing);
      }
    }
  }

  // Rewrite unresolved deps via subtype map before validation
  for (const bean of beans) {
    for (const dep of bean.constructorDeps) {
      if (dep.collection) continue; // Collection deps resolve all providers at runtime
      rewriteDepViaSubtype(dep, registered, subtypeMap, bean);
    }
    for (const field of bean.fieldDeps) {
      rewriteFieldDepViaSubtype(field, registered, subtypeMap, bean);
    }
  }

  // Now validate all required deps have providers
  for (const bean of beans) {
    const ownerName =
      bean.tokenRef.kind === 'class'
        ? bean.tokenRef.className
        : bean.tokenRef.tokenName;

    for (const dep of bean.constructorDeps) {
      if (dep.optional || dep.collection) continue;
      const key = tokenRefKey(dep.tokenRef);
      if (!registered.has(key)) {
        const depName =
          dep.tokenRef.kind === 'class'
            ? dep.tokenRef.className
            : dep.tokenRef.tokenName;
        throw new MissingProviderError(depName, ownerName, dep.sourceLocation);
      }
    }

    for (const field of bean.fieldDeps) {
      if (field.optional) continue;
      const key = tokenRefKey(field.tokenRef);
      if (!registered.has(key)) {
        const depName =
          field.tokenRef.kind === 'class'
            ? field.tokenRef.className
            : field.tokenRef.tokenName;
        throw new MissingProviderError(depName, ownerName, bean.sourceLocation);
      }
    }
  }
}

/**
 * If a dependency has no direct provider but exactly one subtype provides it,
 * rewrite the tokenRef to point at the subtype. Multiple candidates → ambiguous.
 */
function rewriteDepViaSubtype(
  dep: IRDependency,
  registered: Set<string>,
  subtypeMap: Map<string, IRBeanDefinition[]>,
  ownerBean: IRBeanDefinition,
): void {
  const key = tokenRefKey(dep.tokenRef);
  if (registered.has(key)) return;

  const subtypes = subtypeMap.get(key);
  if (!subtypes || subtypes.length === 0) return;

  if (subtypes.length === 1) {
    dep.tokenRef = subtypes[0].tokenRef;
  } else {
    throw new AmbiguousProviderError(
      dep.tokenRef.kind === 'class'
        ? dep.tokenRef.className
        : dep.tokenRef.tokenName,
      subtypes.map((s) =>
        s.tokenRef.kind === 'class'
          ? s.tokenRef.className
          : s.tokenRef.tokenName,
      ),
      ownerBean.sourceLocation,
    );
  }
}

function rewriteFieldDepViaSubtype(
  field: { tokenRef: TokenRef; optional: boolean },
  registered: Set<string>,
  subtypeMap: Map<string, IRBeanDefinition[]>,
  ownerBean: IRBeanDefinition,
): void {
  const key = tokenRefKey(field.tokenRef);
  if (registered.has(key)) return;

  const subtypes = subtypeMap.get(key);
  if (!subtypes || subtypes.length === 0) return;

  if (subtypes.length === 1) {
    field.tokenRef = subtypes[0].tokenRef;
  } else {
    throw new AmbiguousProviderError(
      field.tokenRef.kind === 'class'
        ? field.tokenRef.className
        : field.tokenRef.tokenName,
      subtypes.map((s) =>
        s.tokenRef.kind === 'class'
          ? s.tokenRef.className
          : s.tokenRef.tokenName,
      ),
      ownerBean.sourceLocation,
    );
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
  const path: string[] = [];

  function visit(bean: IRBeanDefinition): void {
    const key = tokenRefKey(bean.tokenRef);
    if (visited.has(key)) return;

    if (visiting.has(key)) {
      // Cycle detected — build the cycle path from the current stack
      const name = tokenRefDisplayName(bean.tokenRef);
      const cycleStart = path.indexOf(name);
      const cyclePath = [...path.slice(cycleStart), name];
      throw new CircularDependencyError(cyclePath, bean.sourceLocation);
    }

    visiting.add(key);
    path.push(tokenRefDisplayName(bean.tokenRef));

    // Visit all dependencies
    for (const dep of getAllDependencies(bean)) {
      const depKey = tokenRefKey(dep.tokenRef);
      const depBean = beanMap.get(depKey);
      if (depBean) {
        visit(depBean);
      }
      // Missing optional deps are already validated — skip silently
    }

    path.pop();
    visiting.delete(key);
    visited.add(key);
    sorted.push(bean);
  }

  for (const bean of beans) {
    visit(bean);
  }

  return sorted;
}

/** Get all dependencies of a bean (constructor + field). */
function getAllDependencies(
  bean: IRBeanDefinition,
): Array<{ tokenRef: TokenRef }> {
  return [
    ...bean.constructorDeps,
    ...bean.fieldDeps.map((f) => ({ tokenRef: f.tokenRef })),
  ];
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
