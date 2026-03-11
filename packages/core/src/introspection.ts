/**
 * Compile-time generated introspection metadata for `@Introspected` classes.
 *
 * These types are produced by the transformer's introspection plugin and
 * consumed at runtime by validation, OpenAPI, and serialization systems.
 *
 * Key distinction: this is NOT reflection. Metadata is generated at build time
 * from AST analysis and embedded in the generated code as data structures.
 */

// ── Field type model (recursive tree) ──

export type FieldType =
  | PrimitiveFieldType
  | LiteralFieldType
  | ArrayFieldType
  | ReferenceFieldType
  | UnionFieldType
  | OptionalFieldType
  | NullableFieldType;

export interface PrimitiveFieldType {
  kind: 'primitive';
  /** e.g. 'string', 'number', 'boolean' */
  type: string;
}

export interface LiteralFieldType {
  kind: 'literal';
  /** The literal value as a string (e.g. '"active"', '42', 'true') */
  value: string;
}

export interface ArrayFieldType {
  kind: 'array';
  elementType: FieldType;
}

export interface ReferenceFieldType {
  kind: 'reference';
  /** The class name of the referenced @Introspected type. */
  className: string;
}

export interface UnionFieldType {
  kind: 'union';
  types: FieldType[];
}

export interface OptionalFieldType {
  kind: 'optional';
  inner: FieldType;
}

export interface NullableFieldType {
  kind: 'nullable';
  inner: FieldType;
}

// ── Decorator metadata ──

/**
 * A single decorator recorded on a field.
 * Generic and decorator-agnostic — downstream consumers (validation, OpenAPI, etc.)
 * interpret recognized decorators and ignore the rest.
 */
export interface DecoratorMeta {
  /** Decorator name (e.g. 'MinLength', 'Email', 'Schema'). */
  name: string;
  /** Decorator arguments as key-value pairs. */
  args: Record<string, unknown>;
}

// ── Introspected field ──

/**
 * Metadata for a single field on an `@Introspected` class.
 */
export interface IntrospectedField {
  /** The field name as declared in the class. */
  name: string;
  /** Recursive type descriptor. */
  type: FieldType;
  /** All decorators found on this field (empty array if none). */
  decorators: DecoratorMeta[];
}

// ── TypeMetadata ──

/**
 * Complete introspection metadata for an `@Introspected` class.
 * Generated at build time by the introspection transformer plugin.
 */
export interface TypeMetadata<T = unknown> {
  /** The class constructor (used as a runtime key). */
  type: new (
    ...args: any[]
  ) => T;
  /** Fully-qualified class name. */
  className: string;
  /** All fields with type and decorator metadata. */
  fields: IntrospectedField[];
}

// ── MetadataRegistry ──

/**
 * Runtime registry of `TypeMetadata` instances.
 *
 * Static singleton: generated code populates `MetadataRegistry.INSTANCE`
 * at module load time, and consumers read from it at runtime.
 * Write-once-at-startup, read-many-at-runtime.
 *
 * No DI needed — any package can access `MetadataRegistry.INSTANCE` directly.
 */
export class MetadataRegistry {
  /** Global singleton instance. Populated by generated code at startup. */
  static readonly INSTANCE = new MetadataRegistry();

  private readonly entries = new Map<
    new (
      ...args: any[]
    ) => unknown,
    TypeMetadata
  >();

  private readonly methodParams = new Map<
    string,
    Array<new (...args: any[]) => unknown>
  >();

  /** Register a TypeMetadata entry. */
  register(metadata: TypeMetadata): void {
    this.entries.set(metadata.type, metadata);
  }

  /** Look up metadata by class constructor. Returns undefined if not registered. */
  get<T>(type: new (...args: any[]) => T): TypeMetadata<T> | undefined {
    return this.entries.get(type) as TypeMetadata<T> | undefined;
  }

  /** Check if a class has been registered. */
  has(type: new (...args: any[]) => unknown): boolean {
    return this.entries.has(type);
  }

  /** Get all registered metadata entries. */
  getAll(): TypeMetadata[] {
    return [...this.entries.values()];
  }

  /**
   * Register parameter types for a method.
   * Generated code calls this so runtime consumers (validation, OpenAPI, etc.)
   * can look up the introspected types of method parameters.
   */
  registerMethodParams(
    target: new (...args: any[]) => unknown,
    methodName: string,
    paramTypes: Array<new (...args: any[]) => unknown>,
  ): void {
    this.methodParams.set(`${target.name}:${methodName}`, paramTypes);
  }

  /**
   * Look up parameter types for a validated method.
   * Returns undefined if not registered.
   */
  getMethodParams(
    target: new (...args: any[]) => unknown,
    methodName: string,
  ): Array<new (...args: any[]) => unknown> | undefined {
    return this.methodParams.get(`${target.name}:${methodName}`);
  }

  /** Reset the registry. For testing only. */
  reset(): void {
    this.entries.clear();
    this.methodParams.clear();
  }
}
