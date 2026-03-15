import { ApplicationContext } from '@goodie-ts/core';
import { Controller, Get, Response } from '@goodie-ts/http';

/**
 * Management endpoint exposing registered component definitions.
 *
 * Returns the full component graph: tokens, scopes, dependencies,
 * conditional rules, and eager/lazy status.
 *
 * Internal framework components (ApplicationContext, __Goodie_Config) are
 * filtered out — only user and library components are shown.
 */
@Controller('/management')
export class ComponentsEndpoint {
  constructor(private readonly context: ApplicationContext) {}

  @Get('/components')
  components() {
    const definitions = this.context
      .getDefinitions()
      .filter((def) =>
        typeof def.token === 'function'
          ? def.token !== ApplicationContext
          : def.token.description !== '__Goodie_Config',
      );

    const components = definitions.map((def) => {
      const token =
        typeof def.token === 'function'
          ? def.token.name
          : def.token.description;

      const dependencies = def.dependencies.map((dep) => {
        const depToken =
          typeof dep.token === 'function'
            ? dep.token.name
            : dep.token.description;
        return {
          token: depToken,
          optional: dep.optional,
          collection: dep.collection,
        };
      });

      const conditional =
        (def.metadata.conditionalRules as unknown[] | undefined) ?? null;

      return {
        token,
        scope: def.scope,
        eager: def.eager,
        dependencies,
        conditional,
      };
    });

    return Response.ok({ components: components });
  }
}
