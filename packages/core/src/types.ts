/** A newable class constructor. */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** An abstract class constructor (not directly instantiable). */
export type AbstractConstructor<T = unknown> = abstract new (
  ...args: any[]
) => T;

/** Bean lifecycle scope. */
export type Scope = 'singleton' | 'prototype' | 'request';

/** A decorator recorded at compile time by the transformer. */
export interface DecoratorEntry {
  /** Decorator function name (e.g. "Secured", "Controller"). */
  name: string;
  /** Resolved import path (bare package specifier or absolute). */
  importPath: string;
}
