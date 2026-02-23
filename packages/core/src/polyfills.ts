// Polyfill Symbol.metadata if the runtime doesn't support it yet
(Symbol as { metadata?: symbol }).metadata ??= Symbol('Symbol.metadata');
