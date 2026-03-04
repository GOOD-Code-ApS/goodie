/** A newable class constructor. */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** An abstract class constructor (not directly instantiable). */
export type AbstractConstructor<T = unknown> = abstract new (
  ...args: any[]
) => T;

/** Bean lifecycle scope. */
export type Scope = 'singleton' | 'prototype';
