/** A newable class constructor. */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** Bean lifecycle scope. */
export type Scope = 'singleton' | 'prototype';
