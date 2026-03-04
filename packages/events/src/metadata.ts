/** Metadata keys for event listener decorators. */
export const EVENTS_META = {
  LISTENERS: Symbol('goodie:events:listeners'),
} as const;

export interface ListenerMetadata {
  methodName: string;
  /** The event class constructor — used for runtime matching via `event.constructor`. */
  eventType: new (
    ...args: any[]
  ) => object;
  order: number;
}
