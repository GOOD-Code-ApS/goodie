import {
  type ApplicationContext,
  type DecoratorMeta,
  type FieldType,
  MetadataRegistry,
  Singleton,
  type TypeMetadata,
} from '@goodie-ts/core';
import type { ControllerMetadata, RouteMetadata } from '@goodie-ts/http';
import {
  OpenApiBuilder,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type SchemaObject,
} from 'openapi3-ts/oas31';

import type { OpenApiConfig } from './openapi-config.js';

/**
 * Builds an OpenAPI 3.1 spec from runtime introspection metadata
 * and controller route metadata.
 *
 * Reads from two sources:
 * - `MetadataRegistry` for `@Introspected` type shapes and constraints
 * - `ApplicationContext.getDefinitions()` for `ControllerMetadata` on controllers
 *
 * The spec is built once on first access and cached.
 */
@Singleton()
export class OpenApiSpecBuilder {
  private cachedSpec: object | undefined;

  constructor(
    private readonly context: ApplicationContext,
    private readonly config: OpenApiConfig,
  ) {}

  /** Get the OpenAPI spec object, building it on first call. */
  getSpec(): object {
    if (this.cachedSpec) return this.cachedSpec;
    this.cachedSpec = this.buildSpec();
    return this.cachedSpec;
  }

  private buildSpec(): object {
    const builder = OpenApiBuilder.create()
      .addOpenApiVersion('3.1.0')
      .addInfo({
        title: this.config.title,
        version: this.config.version,
        ...(this.config.description
          ? { description: this.config.description }
          : {}),
      });

    const controllers = this.discoverControllers();
    const schemaNames = new Set<string>();

    for (const { name, metadata: ctrl } of controllers) {
      for (const route of ctrl.routes) {
        const fullPath = toOpenApiPath(
          normalizePath(ctrl.basePath, route.path),
        );
        const operation = this.buildOperation(name, route, schemaNames);

        const existing =
          (builder.getSpec().paths?.[fullPath] as PathItemObject) ?? {};
        existing[route.httpMethod] = operation;
        builder.addPath(fullPath, existing);
      }
    }

    // Add all referenced schemas as components
    for (const name of schemaNames) {
      const metadata = this.findMetadataByName(name);
      if (metadata) {
        builder.addSchema(name, this.buildObjectSchema(metadata, schemaNames));
      }
    }

    return builder.getSpec();
  }

  private discoverControllers(): Array<{
    name: string;
    metadata: ControllerMetadata;
  }> {
    const definitions = this.context.getDefinitions();
    const controllers: Array<{
      name: string;
      metadata: ControllerMetadata;
    }> = [];

    for (const def of definitions) {
      const httpCtrl = def.metadata.httpController as
        | ControllerMetadata
        | undefined;
      if (!httpCtrl) continue;

      const name = typeof def.token === 'function' ? def.token.name : 'Unknown';
      controllers.push({ name, metadata: httpCtrl });
    }

    return controllers;
  }

  private buildOperation(
    controllerName: string,
    route: RouteMetadata,
    schemaNames: Set<string>,
  ): OperationObject {
    const operation: OperationObject = {
      operationId: `${controllerName}_${route.methodName}`,
      responses: {},
    };

    // Parameters (path + query)
    const parameters: ParameterObject[] = [];
    let requestBodySchema: SchemaObject | undefined;

    for (const param of route.params) {
      if (param.binding === 'path') {
        parameters.push({
          name: param.name,
          in: 'path',
          required: !param.optional,
          schema: primitiveSchema(param.typeName),
        });
      } else if (param.binding === 'query') {
        parameters.push({
          name: param.name,
          in: 'query',
          required: !param.optional,
          schema: primitiveSchema(param.typeName),
        });
      } else if (param.binding === 'body') {
        requestBodySchema = this.resolveTypeSchema(param.typeName, schemaNames);
      }
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (requestBodySchema) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: requestBodySchema },
        },
      };
    }

    // Response
    const responseSchema = this.resolveReturnTypeSchema(
      route.returnType,
      schemaNames,
    );
    const statusCode = String(route.status);

    if (responseSchema) {
      operation.responses[statusCode] = {
        description: '',
        content: {
          'application/json': { schema: responseSchema },
        },
      };
    } else {
      operation.responses[statusCode] = { description: '' };
    }

    return operation;
  }

  /**
   * Resolve a type name (from ParamMetadata.typeName) to an OpenAPI schema.
   * For known @Introspected types, returns a $ref. For primitives, returns inline.
   */
  private resolveTypeSchema(
    typeName: string,
    schemaNames: Set<string>,
  ): SchemaObject {
    const metadata = this.findMetadataByName(typeName);
    if (metadata) {
      schemaNames.add(typeName);
      return { $ref: `#/components/schemas/${typeName}` };
    }
    return primitiveSchema(typeName);
  }

  /**
   * Resolve a return type string to an OpenAPI schema.
   * Handles: class names, arrays (Todo[]), unions (Todo | null), void.
   */
  private resolveReturnTypeSchema(
    returnType: string,
    schemaNames: Set<string>,
  ): SchemaObject | undefined {
    if (returnType === 'void') return undefined;

    // Array: "ClassName[]"
    if (returnType.endsWith('[]')) {
      const elementType = returnType.slice(0, -2).trim();
      return {
        type: 'array',
        items: this.resolveTypeSchema(elementType, schemaNames),
      };
    }

    // Union: "A | B"
    if (returnType.includes(' | ')) {
      const members = returnType.split(' | ').map((s) => s.trim());
      const schemas = members
        .filter((m) => m !== 'null' && m !== 'undefined')
        .map((m) => this.resolveTypeSchema(m, schemaNames));

      const hasNull = members.includes('null');

      if (schemas.length === 1 && hasNull) {
        return toNullable(schemas[0]);
      }
      if (schemas.length === 1) return schemas[0];
      return { oneOf: schemas };
    }

    // Single type
    return this.resolveTypeSchema(returnType, schemaNames);
  }

  /** Build an object schema from TypeMetadata with field types and constraints. */
  private buildObjectSchema(
    metadata: TypeMetadata,
    schemaNames: Set<string>,
  ): SchemaObject {
    const properties: Record<string, SchemaObject> = {};
    const required: string[] = [];

    for (const field of metadata.fields) {
      const fieldSchema = this.fieldTypeToSchema(field.type, schemaNames);
      const withConstraints = applyConstraints(fieldSchema, field.decorators);
      const withSchemaDecorator = applySchemaDecorator(
        withConstraints,
        field.decorators,
      );
      properties[field.name] = withSchemaDecorator;

      if (!isOptionalType(field.type)) {
        required.push(field.name);
      }
    }

    const schema: SchemaObject = { type: 'object', properties };
    if (required.length > 0) schema.required = required;
    return schema;
  }

  private fieldTypeToSchema(
    type: FieldType,
    schemaNames: Set<string>,
  ): SchemaObject {
    switch (type.kind) {
      case 'primitive':
        return primitiveSchema(type.type);
      case 'literal':
        return literalSchema(type.value);
      case 'array':
        return {
          type: 'array',
          items: this.fieldTypeToSchema(type.elementType, schemaNames),
        };
      case 'reference': {
        const metadata = this.findMetadataByName(type.className);
        if (metadata) {
          schemaNames.add(type.className);
          return { $ref: `#/components/schemas/${type.className}` };
        }
        return {};
      }
      case 'union': {
        const schemas = type.types
          .filter(
            (t) =>
              !(t.kind === 'primitive' && t.type === 'undefined') &&
              !(t.kind === 'primitive' && t.type === 'null'),
          )
          .map((t) => this.fieldTypeToSchema(t, schemaNames));
        if (schemas.length === 1) return schemas[0];
        return { oneOf: schemas };
      }
      case 'optional':
        return this.fieldTypeToSchema(type.inner, schemaNames);
      case 'nullable':
        return toNullable(this.fieldTypeToSchema(type.inner, schemaNames));
    }
  }

  private findMetadataByName(className: string): TypeMetadata | undefined {
    return MetadataRegistry.INSTANCE.getAll().find(
      (m) => m.className === className,
    );
  }
}

// ── Helpers ──

function normalizePath(basePath: string, routePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return route === '/' ? base || '/' : `${base}${route}`;
}

/** Convert Express-style `:param` to OpenAPI `{param}`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z_]\w*)/g, '{$1}');
}

function primitiveSchema(typeName: string): SchemaObject {
  switch (typeName) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return {};
  }
}

function literalSchema(value: string): SchemaObject {
  if (value.startsWith('"') && value.endsWith('"')) {
    const str = value.slice(1, -1);
    return { type: 'string', enum: [str] };
  }
  if (value === 'true') return { type: 'boolean', enum: [true] };
  if (value === 'false') return { type: 'boolean', enum: [false] };
  const num = Number(value);
  if (!Number.isNaN(num)) return { type: 'number', enum: [num] };
  return {};
}

/**
 * Make a schema nullable using OAS 3.1 conventions.
 * - For `$ref`: wraps in `oneOf: [$ref, { type: 'null' }]`
 * - For inline schemas with `type`: converts to `type: [originalType, 'null']`
 */
function toNullable(schema: SchemaObject): SchemaObject {
  if (schema.$ref) {
    return { oneOf: [schema, { type: 'null' }] };
  }
  if (typeof schema.type === 'string') {
    return { ...schema, type: [schema.type, 'null'] };
  }
  return { oneOf: [schema, { type: 'null' }] };
}

function isOptionalType(type: FieldType): boolean {
  return type.kind === 'optional';
}

/** Map well-known constraint decorators to OpenAPI schema properties. */
function applyConstraints(
  schema: SchemaObject,
  decorators: DecoratorMeta[],
): SchemaObject {
  const result = { ...schema };

  for (const dec of decorators) {
    const val = dec.args.value;

    switch (dec.name) {
      case 'MinLength':
        result.minLength = val as number;
        break;
      case 'MaxLength':
        result.maxLength = val as number;
        break;
      case 'Min':
        result.minimum = val as number;
        break;
      case 'Max':
        result.maximum = val as number;
        break;
      case 'Pattern':
        result.pattern = val as string;
        break;
      case 'NotBlank':
        result.minLength = result.minLength ?? 1;
        break;
      case 'Email':
        result.format = result.format ?? 'email';
        break;
      case 'Size': {
        const isArray = result.type === 'array';
        if (isArray) {
          result.minItems = val as number;
          result.maxItems = dec.args.value2 as number;
        } else {
          result.minLength = val as number;
          result.maxLength = dec.args.value2 as number;
        }
        break;
      }
    }
  }

  return result;
}

/** Apply `@Schema` decorator metadata to the schema. */
function applySchemaDecorator(
  schema: SchemaObject,
  decorators: DecoratorMeta[],
): SchemaObject {
  const schemaDec = decorators.find((d) => d.name === 'Schema');
  if (!schemaDec) return schema;

  const result = { ...schema };
  const args = schemaDec.args;

  if (args.description !== undefined)
    result.description = args.description as string;
  if (args.example !== undefined) result.example = args.example;
  if (args.format !== undefined) result.format = args.format as string;
  if (args.deprecated !== undefined)
    result.deprecated = args.deprecated as boolean;
  if (args.default !== undefined) result.default = args.default;
  if (args.enum !== undefined) result.enum = args.enum as unknown[];
  if (args.readOnly !== undefined) result.readOnly = args.readOnly as boolean;
  if (args.writeOnly !== undefined)
    result.writeOnly = args.writeOnly as boolean;

  return result;
}
