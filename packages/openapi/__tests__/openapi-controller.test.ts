import { Response } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import { OpenApiController } from '../src/openapi-controller.js';
import type { OpenApiSpecBuilder } from '../src/openapi-spec-builder.js';

describe('OpenApiController', () => {
  it('returns the cached spec as a 200 JSON response', () => {
    const mockSpec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
    };
    const mockBuilder = {
      getSpec: vi.fn().mockReturnValue(mockSpec),
    } as unknown as OpenApiSpecBuilder;

    const controller = new OpenApiController(mockBuilder);
    const result = controller.spec();

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(result.body).toBe(mockSpec);
    expect(mockBuilder.getSpec).toHaveBeenCalledOnce();
  });
});
