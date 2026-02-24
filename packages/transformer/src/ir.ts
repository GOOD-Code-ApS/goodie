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
  sourceLocation: SourceLocation;
}

/** A field injection discovered from @Inject / @Optional on an accessor. */
export interface IRFieldInjection {
  fieldName: string;
  tokenRef: TokenRef;
  optional: boolean;
}

/** A @Provides method discovered inside a @Module class. */
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

/** A @Module class with its @Provides methods. */
export interface IRModule {
  /** The module class itself. */
  classTokenRef: ClassTokenRef;
  /** Imported module class refs (from @Module({ imports: [...] })). */
  imports: ClassTokenRef[];
  /** @Provides methods defined on this module. */
  provides: IRProvides[];
  sourceLocation: SourceLocation;
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
  metadata: Record<string, unknown>;
  /** All ancestor class tokens (direct parent first, root last). */
  baseTokenRefs?: ClassTokenRef[];
  sourceLocation: SourceLocation;
}
