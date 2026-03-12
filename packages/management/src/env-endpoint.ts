import type { ApplicationContext } from '@goodie-ts/core';
import { Controller, Get, Response } from '@goodie-ts/http';

/**
 * Micronaut-style default mask patterns.
 * Keys are split on `.`, `_`, `-` separators and matched at the segment level
 * to avoid false positives (e.g. "monkey" won't match "key").
 */
const SENSITIVE_PATTERNS = [
  'password',
  'credential',
  'certificate',
  'key',
  'secret',
  'token',
];

const MASK = '******';

/**
 * Management endpoint exposing resolved configuration.
 *
 * Sensitive values are masked following Micronaut's approach:
 * keys containing "password", "credential", "certificate",
 * "key", "secret", or "token" are replaced with "******".
 */
@Controller('/management')
export class EnvEndpoint {
  constructor(private readonly context: ApplicationContext) {}

  @Get('/env')
  env() {
    const config = this.resolveConfig();
    const properties: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      properties[key] = isSensitive(key) ? MASK : value;
    }

    return Response.ok({ properties });
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

/** Check if a config key should be masked (segment-level matching). */
function isSensitive(key: string): boolean {
  const segments = key.toLowerCase().split(/[._-]/);
  return SENSITIVE_PATTERNS.some((p) => segments.some((s) => s === p));
}
