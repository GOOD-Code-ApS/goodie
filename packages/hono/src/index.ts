// Re-export HTTP decorators from @goodie-ts/http
export { Controller, Delete, Get, Patch, Post, Put } from '@goodie-ts/http';

// Hono-specific types and beans
export { EmbeddedServer } from './embedded-server.js';
// Runtime helpers for generated route wiring
export {
  corsMiddleware,
  handleResult,
  requestScopeMiddleware,
} from './router-helpers.js';
export type { CorsConfig, ServerRuntime } from './server-config.js';
export { ServerConfig } from './server-config.js';
