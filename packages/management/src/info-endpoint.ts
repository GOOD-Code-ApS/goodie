import type { ApplicationContext } from '@goodie-ts/core';
import { Controller, Get, Response } from '@goodie-ts/http';

const INFO_PREFIX = 'info.';

/**
 * Management endpoint exposing application info.
 *
 * Reads all config properties under the `info.*` prefix and
 * returns them as a nested object. For example:
 *
 * ```json
 * { "info.app.name": "my-app", "info.app.version": "1.0.0" }
 * ```
 *
 * becomes:
 *
 * ```json
 * { "app": { "name": "my-app", "version": "1.0.0" } }
 * ```
 */
@Controller('/management')
export class InfoEndpoint {
  constructor(private readonly context: ApplicationContext) {}

  @Get('/info')
  info() {
    const config = this.resolveConfig();
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      if (!key.startsWith(INFO_PREFIX)) continue;
      const path = key.slice(INFO_PREFIX.length);
      setNestedValue(result, path, value);
    }

    return Response.ok(result);
  }

  private resolveConfig(): Record<string, unknown> {
    const definitions = this.context.getDefinitions();
    const configDef = definitions.find(
      (d) =>
        typeof d.token !== 'function' &&
        d.token.description === '__Goodie_Config',
    );

    if (configDef) {
      const result = configDef.factory();
      if (result && typeof result === 'object') {
        return result as Record<string, unknown>;
      }
    }

    return {};
  }
}

/** Set a dotted path like "app.name" to a value in a nested object. */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      typeof current[part] !== 'object' ||
      current[part] === null
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}
