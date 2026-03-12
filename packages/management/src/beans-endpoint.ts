import { ApplicationContext } from '@goodie-ts/core';
import { Controller, Get, Response } from '@goodie-ts/http';

/**
 * Management endpoint exposing registered bean definitions.
 *
 * Returns the full bean graph: tokens, scopes, dependencies,
 * conditional rules, and eager/lazy status.
 *
 * Internal framework beans (ApplicationContext, __Goodie_Config) are
 * filtered out — only user and library beans are shown.
 */
@Controller('/management')
export class BeansEndpoint {
  constructor(private readonly context: ApplicationContext) {}

  @Get('/beans')
  beans() {
    const definitions = this.context
      .getDefinitions()
      .filter((def) =>
        typeof def.token === 'function'
          ? def.token !== ApplicationContext
          : def.token.description !== '__Goodie_Config',
      );

    const beans = definitions.map((def) => {
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

    return Response.ok({ beans });
  }
}
