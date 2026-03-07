import type { Scope } from '@goodie-ts/core';

/** Source location for error messages pointing back to user code. */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

/**
 * Reference to a bean token — either a class constructor or an InjectionToken.
 *
 * `kind: 'class'` → the token is the class constructor itself.
 * `kind: 'injection-token'` → an auto-generated InjectionToken (e.g. from @Provides method name).
 */
export type TokenRef = ClassTokenRef | InjectionTokenRef;

export interface ClassTokenRef {
  kind: 'class';
  /** The class name as it appears in user code. */
  className: string;
  /** Absolute path to the file that exports this class. */
  importPath: string;
}

export interface InjectionTokenRef {
  kind: 'injection-token';
  /** The token description / variable name (e.g. 'dbUrl'). */
  tokenName: string;
  /**
   * If the token comes from a user-declared InjectionToken variable, its import path.
   * Undefined for auto-generated method-name tokens.
   */
  importPath: string | undefined;
  /**
   * The original return type annotation for codegen (e.g. 'Repository<User>').
   * Used to emit typed InjectionToken<T> declarations instead of <unknown>.
   */
  typeAnnotation?: string;
  /**
   * Map of type name → absolute import path for types referenced in typeAnnotation.
   * Used to emit correct type-only imports in generated code.
   */
  typeImports?: Map<string, string>;
}

/** A single dependency of a bean in the IR. */
export interface IRDependency {
  tokenRef: TokenRef;
  optional: boolean;
  /** When true, inject all beans under this token as an array (T[]). */
  collection: boolean;
  sourceLocation: SourceLocation;
}

/** A field injection discovered from @Inject / @Optional on an accessor. */
export interface IRFieldInjection {
  fieldName: string;
  tokenRef: TokenRef;
  optional: boolean;
}

/** A @Provides method discovered inside a bean class. */
export interface IRProvides {
  methodName: string;
  /** Token for the bean this method produces. */
  tokenRef: TokenRef;
  scope: Scope;
  eager: boolean;
  /** Dependencies of the method parameters. */
  dependencies: IRDependency[];
  sourceLocation: SourceLocation;
}

/** A decorator found on a class or method, recorded by the scanner. */
export interface IRDecoratorEntry {
  /** Decorator function name (e.g. "Controller", "Secured"). */
  name: string;
  /** Resolved import path of the decorator (bare specifier or absolute). */
  importPath: string;
}

/** Full intermediate representation of a single bean. */
export interface IRBeanDefinition {
  tokenRef: TokenRef;
  scope: Scope;
  eager: boolean;
  /** Qualifier name from @Named(). */
  name: string | undefined;
  /** Constructor parameter dependencies (in order). */
  constructorDeps: IRDependency[];
  /** Accessor field injections (in declaration order). */
  fieldDeps: IRFieldInjection[];
  /**
   * How this bean is created:
   * - 'constructor': `new Class(dep0, dep1)`
   * - 'provides': `module.method(dep0)` — from a @Provides method
   */
  factoryKind: 'constructor' | 'provides';
  /** For 'provides' beans: the module class and method name. */
  providesSource:
    | { moduleTokenRef: ClassTokenRef; methodName: string }
    | undefined;
  /** Base class tokens this bean should also be registered under. */
  baseTokenRefs?: ClassTokenRef[];
  /** Decorators found on this class (for DecoratorMetadata queries). */
  decorators?: IRDecoratorEntry[];
  /** Decorators found on methods, keyed by method name. */
  methodDecorators?: Record<string, IRDecoratorEntry[]>;
  metadata: Record<string, unknown>;
  sourceLocation: SourceLocation;
}
