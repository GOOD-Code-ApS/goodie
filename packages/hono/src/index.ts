export { EmbeddedServer } from './embedded-server.js';
// Runtime helpers for generated route wiring
export {
  buildRequest,
  corsMiddleware,
  handleError,
  handleResult,
  requestScopeMiddleware,
} from './router-helpers.js';
export type { CorsConfig, ServerRuntime } from './server-config.js';
export { ServerConfig } from './server-config.js';
