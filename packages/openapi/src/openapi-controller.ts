import { Controller, Get, Response } from '@goodie-ts/http';

import type { OpenApiSpecBuilder } from './openapi-spec-builder.js';

/**
 * Controller serving the OpenAPI specification.
 *
 * Serves the cached OpenAPI spec as JSON at `/openapi.json`.
 */
@Controller('/openapi')
export class OpenApiController {
  constructor(private readonly specBuilder: OpenApiSpecBuilder) {}

  @Get('.json')
  spec() {
    return Response.ok(this.specBuilder.getSpec());
  }
}
