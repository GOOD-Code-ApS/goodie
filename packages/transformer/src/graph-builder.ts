import fs from 'node:fs';
import path from 'node:path';
import type { ConditionalRule } from './builtin-conditional-plugin.js';
import type { IRBeanDefinition, TokenRef } from './ir.js';
import type { ResolveResult } from './resolver.js';
import {
  AmbiguousProviderError,
  CircularDependencyError,
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

/** Options for the graph builder. */
export interface GraphBuildOptions {
  /**
   * Directory containing JSON config files (`default.json`, `{env}.json`).
   * Used to evaluate @ConditionalOnProperty conditions.
   */
  configDir?: string;
}

/** Info about a bean that was filtered out by a conditional rule. */
interface FilteredBeanInfo {
  displayName: string;
  reason: string;
}

/**
 * Build a full dependency graph from resolved IR,
 * validate, and return beans in topological order.
 */
export function buildGraph(
  resolveResult: ResolveResult,
  options?: GraphBuildOptions,
): GraphResult {
  const warnings: string[] = [...resolveResult.warnings];
  let allBeans: IRBeanDefinition[] = [...resolveResult.beans];

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

  // Apply conditional bean filtering (env → property → missingBean)
  const filteredOut = new Map<string, FilteredBeanInfo>();
  allBeans = filterConditionalBeans(allBeans, filteredOut, options);

  // Build name-based lookup for @Named → @Inject('name') matching
  resolveNamedQualifiers(allBeans, warnings);

  // Validate: no missing providers (except optional)
  validateProviders(allBeans, filteredOut);

  // Topological sort with cycle detection
  const sorted = topoSort(allBeans);

  return { beans: sorted, warnings };
}

/**
 * Filter beans based on conditional rules in metadata.
 * Order: onEnv → onProperty → onMissingBean (since missingBean depends on what remains).
 * All conditions on a single bean use AND logic.
 */
function filterConditionalBeans(
  beans: IRBeanDefinition[],
  filteredOut: Map<string, FilteredBeanInfo>,
  options?: GraphBuildOptions,
): IRBeanDefinition[] {
  // Load config for @ConditionalOnProperty evaluation
  let configProperties: Record<string, unknown> | undefined;

  // Phase 1: filter by onEnv and onProperty
  let remaining = beans.filter((bean) => {
    const rules = bean.metadata.conditionalRules as
      | ConditionalRule[]
      | undefined;
    if (!rules || rules.length === 0) return true;

    for (const rule of rules) {
      if (rule.type === 'onEnv') {
        const envValue = process.env[rule.envVar!];
        if (rule.expectedValue !== undefined) {
          if (envValue !== rule.expectedValue) {
            recordFiltered(
              bean,
              filteredOut,
              `@ConditionalOnEnv('${rule.envVar}', '${rule.expectedValue}') — env var is '${envValue ?? '<undefined>'}'`,
            );
            return false;
          }
        } else {
          if (envValue === undefined) {
            recordFiltered(
              bean,
              filteredOut,
              `@ConditionalOnEnv('${rule.envVar}') — env var is not set`,
            );
            return false;
          }
        }
      } else if (rule.type === 'onProperty') {
        if (!configProperties) {
          configProperties = loadConfigProperties(options?.configDir);
        }
        const propValue = getNestedProperty(configProperties, rule.key!);
        if (rule.expectedValue !== undefined) {
          if (String(propValue) !== rule.expectedValue) {
            recordFiltered(
              bean,
              filteredOut,
              `@ConditionalOnProperty('${rule.key}', '${rule.expectedValue}') — property is '${propValue ?? '<undefined>'}'`,
            );
            return false;
          }
        } else {
          if (propValue === undefined) {
            recordFiltered(
              bean,
              filteredOut,
              `@ConditionalOnProperty('${rule.key}') — property is not set`,
            );
            return false;
          }
        }
      }
      // onMissingBean is handled in phase 2
    }
    return true;
  });

  // Phase 2: filter by onMissingBean (evaluated against remaining beans)
  const registeredKeys = new Set<string>();
  for (const bean of remaining) {
    registeredKeys.add(tokenRefKey(bean.tokenRef));
  }

  remaining = remaining.filter((bean) => {
    const rules = bean.metadata.conditionalRules as
      | ConditionalRule[]
      | undefined;
    if (!rules || rules.length === 0) return true;

    for (const rule of rules) {
      if (rule.type !== 'onMissingBean') continue;

      const targetKey = `class:${rule.tokenImportPath}:${rule.tokenClassName}`;

      // Check if any remaining bean (other than this one) provides the target token
      let found = false;
      for (const other of remaining) {
        if (other === bean) continue;
        if (tokenRefKey(other.tokenRef) === targetKey) {
          found = true;
          break;
        }
      }

      if (found) {
        recordFiltered(
          bean,
          filteredOut,
          `@ConditionalOnMissingBean(${rule.tokenClassName}) — a provider already exists`,
        );
        return false;
      }
    }
    return true;
  });

  return remaining;
}

function recordFiltered(
  bean: IRBeanDefinition,
  filteredOut: Map<string, FilteredBeanInfo>,
  reason: string,
): void {
  const key = tokenRefKey(bean.tokenRef);
  const displayName = tokenRefDisplayName(bean.tokenRef);
  filteredOut.set(key, { displayName, reason });
}

/**
 * Load config properties from configDir for @ConditionalOnProperty evaluation.
 * Merges default.json + {NODE_ENV}.json.
 */
function loadConfigProperties(
  configDir: string | undefined,
): Record<string, unknown> {
  if (!configDir) return {};

  const result: Record<string, unknown> = {};

  // Load default.json
  const defaultPath = path.join(configDir, 'default.json');
  try {
    const content = fs.readFileSync(defaultPath, 'utf-8');
    Object.assign(result, flattenObject(JSON.parse(content)));
  } catch {
    // No default.json — that's fine
  }

  // Load {NODE_ENV}.json
  const env = process.env.NODE_ENV;
  if (env) {
    const envPath = path.join(configDir, `${env}.json`);
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      Object.assign(result, flattenObject(JSON.parse(content)));
    } catch {
      // No env-specific config — that's fine
    }
  }

  return result;
}

/**
 * Flatten a nested object into dot-separated keys.
 * { a: { b: 1 } } → { 'a.b': 1 }
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, fullKey),
      );
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Get a nested property value using dot-notation key from a flat config map.
 */
function getNestedProperty(
  config: Record<string, unknown>,
  key: string,
): unknown {
  return config[key];
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
function validateProviders(
  beans: IRBeanDefinition[],
  filteredOut: Map<string, FilteredBeanInfo>,
): void {
  const registered = new Set<string>();
  for (const bean of beans) {
    registered.add(tokenRefKey(bean.tokenRef));
  }

  // Well-known tokens always available at runtime (self-registered by ApplicationContext)
  registered.add('class:@goodie-ts/core:ApplicationContext');

  // Validate all required deps have providers
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
        throw new MissingProviderError(
          depName,
          ownerName,
          dep.sourceLocation,
          buildFilteredHint(key, filteredOut),
        );
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
        throw new MissingProviderError(
          depName,
          ownerName,
          bean.sourceLocation,
          buildFilteredHint(key, filteredOut),
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
          buildFilteredHint(key, filteredOut),
        );
      }
    }
  }
}

/**
 * Build a custom hint when a missing provider was filtered out by a condition.
 * Returns undefined if the provider was not filtered (falls back to default hint).
 */
function buildFilteredHint(
  depKey: string,
  filteredOut: Map<string, FilteredBeanInfo>,
): string | undefined {
  const info = filteredOut.get(depKey);
  if (!info) return undefined;
  return `A provider for "${info.displayName}" exists but was excluded by a conditional rule: ${info.reason}`;
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
