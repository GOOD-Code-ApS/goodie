import type { BeanDefinition } from './bean-definition.js';
import { CircularDependencyError } from './errors.js';
import type { InjectionToken } from './injection-token.js';
import type { Constructor } from './types.js';

type Token = InjectionToken<unknown> | Constructor;

/**
 * Topologically sorts bean definitions so that dependencies come before
 * the beans that depend on them. Detects cycles and reports the full path.
 *
 * Optional dependencies are included in ordering when present but do not
 * cause failures when missing.
 */
export function topoSort(definitions: BeanDefinition[]): BeanDefinition[] {
  const defByToken = new Map<Token, BeanDefinition>();
  for (const def of definitions) {
    defByToken.set(def.token, def);
  }

  const IN_STACK = 1;
  const DONE = 2;

  const state = new Map<Token, number>();
  const sorted: BeanDefinition[] = [];

  // Track the current DFS path for cycle reporting
  const pathStack: Token[] = [];

  function visit(def: BeanDefinition): void {
    const token = def.token;
    const s = state.get(token);

    if (s === DONE) return;

    if (s === IN_STACK) {
      // Extract cycle path from the stack
      const cycleStart = pathStack.indexOf(token);
      const cyclePath = pathStack.slice(cycleStart).map(tokenName);
      cyclePath.push(tokenName(token));
      throw new CircularDependencyError(cyclePath);
    }

    state.set(token, IN_STACK);
    pathStack.push(token);

    for (const dep of def.dependencies) {
      const depDef = defByToken.get(dep.token);
      if (depDef) {
        visit(depDef);
      }
      // If the dep is not found and it's optional, skip silently.
      // Missing required deps are validated separately by ApplicationContext.
    }

    pathStack.pop();
    state.set(token, DONE);
    sorted.push(def);
  }

  for (const def of definitions) {
    if (!state.has(def.token)) {
      visit(def);
    }
  }

  return sorted;
}

function tokenName(token: Token): string {
  if (typeof token === 'function') {
    return token.name || 'Anonymous';
  }
  return token.description;
}
