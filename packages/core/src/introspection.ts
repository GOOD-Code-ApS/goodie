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
  /** Source file path of the referenced type. Used to disambiguate same-named classes. */
  importPath?: string;
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
  /** Source file path. Used to disambiguate same-named classes from different modules. */
  importPath?: string;
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
    new (
      ...args: any[]
    ) => unknown,
    Map<
      string,
      Array<{
        paramType: new (...args: any[]) => unknown;
        paramIndex: number;
      }>
    >
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
   * Register a single validated parameter for a method.
   * Generated code calls this once per class-typed param so runtime consumers
   * (validation, OpenAPI, etc.) can look up which arguments to validate.
   */
  registerMethodParam(
    target: new (...args: any[]) => unknown,
    methodName: string,
    paramType: new (...args: any[]) => unknown,
    paramIndex: number,
  ): void {
    let methods = this.methodParams.get(target);
    if (!methods) {
      methods = new Map();
      this.methodParams.set(target, methods);
    }
    let entries = methods.get(methodName);
    if (!entries) {
      entries = [];
      methods.set(methodName, entries);
    }
    entries.push({ paramType, paramIndex });
  }

  /**
   * Look up validated parameter entries for a method.
   * Returns undefined if no params are registered.
   */
  getMethodParams(
    target: new (...args: any[]) => unknown,
    methodName: string,
  ):
    | Array<{
        paramType: new (...args: any[]) => unknown;
        paramIndex: number;
      }>
    | undefined {
    return this.methodParams.get(target)?.get(methodName);
  }

  /** Reset the registry. For testing only. */
  reset(): void {
    this.entries.clear();
    this.methodParams.clear();
  }
}
