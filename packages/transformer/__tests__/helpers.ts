import { Project } from 'ts-morph';
import type { TransformerPlugin } from '../src/options.js';
import { transformInMemory } from '../src/transform.js';

/** Standard decorator stubs for in-memory test projects. */
export const DECORATOR_STUBS = `
export function Injectable() { return (t: any, c: any) => {} }
export function Singleton() { return (t: any, c: any) => {} }
export function Named(n: string) { return (t: any, c: any) => {} }
export function Eager() { return (t: any, c: any) => {} }
export function Module(opts?: any) { return (t: any, c: any) => {} }
export function Provides() { return (t: any, c: any) => {} }
export function Inject(q: any) { return (t: any, c: any) => {} }
export function Optional() { return (t: any, c: any) => {} }
export function PreDestroy() { return (t: any, c: any) => {} }
export function PostConstruct() { return (t: any, c: any) => {} }
export function PostProcessor() { return (t: any, c: any) => {} }
export function Value(key: string, opts?: any) { return (t: any, c: any) => {} }
export function Around(interceptor: any, opts?: any) { return (t: any, c: any) => {} }
export function Before(interceptor: any, opts?: any) { return (t: any, c: any) => {} }
export function After(interceptor: any, opts?: any) { return (t: any, c: any) => {} }
export function Controller(path?: string) { return (t: any, c: any) => {} }
export function Get(path?: string, options?: any) { return (t: any, c: any) => {} }
export function Post(path?: string, options?: any) { return (t: any, c: any) => {} }
export function Put(path?: string, options?: any) { return (t: any, c: any) => {} }
export function Delete(path?: string, options?: any) { return (t: any, c: any) => {} }
export function Patch(path?: string, options?: any) { return (t: any, c: any) => {} }
export function Log(opts?: any) { return (t: any, c: any) => {} }
export function Cacheable(name: string, opts?: any) { return (t: any, c: any) => {} }
export function CacheEvict(name: string, opts?: any) { return (t: any, c: any) => {} }
export function CachePut(name: string, opts?: any) { return (t: any, c: any) => {} }
export function Retryable(opts?: any) { return (t: any, c: any) => {} }
export function CircuitBreaker(opts?: any) { return (t: any, c: any) => {} }
export function Timeout(duration: number) { return (t: any, c: any) => {} }
export function ConfigurationProperties(prefix: string) { return (t: any, c: any) => {} }
export function Transactional(opts?: any) { return (t: any, c: any) => {} }
export function Migration(name: string) { return (t: any, c: any) => {} }
export function Validate(targets: any) { return (t: any, c: any) => {} }
export function Cors(opts?: any) { return (t: any, c: any) => {} }
export function Secured() { return (t: any, c: any) => {} }
export function Anonymous() { return (t: any, c: any) => {} }
export function ConditionalOnEnv(envVar: string, value?: string) { return (t: any, c: any) => {} }
export function ConditionalOnProperty(key: string, value?: string | { havingValue: string | string[] }) { return (t: any, c: any) => {} }
export function ConditionalOnMissingBean(token: any) { return (t: any, c: any) => {} }
export function RequestScoped() { return (t: any, c: any) => {} }
export function Introspected(opts?: any) { return (t: any, c: any) => {} }
export function MinLength(value: number) { return (t: any, c: any) => {} }
export function MaxLength(value: number) { return (t: any, c: any) => {} }
export function Email() { return (t: any, c: any) => {} }
export function Validated() { return (t: any, c: any) => {} }
export function Status(code: number) { return (t: any, c: any) => {} }
export class HttpContext {
  readonly headers: any;
  readonly query: any;
  readonly params: Record<string, string>;
  readonly url: string;
  constructor(opts: any) { this.headers = opts.headers; this.query = opts.query; this.params = opts.params ?? {}; this.url = opts.url ?? ''; }
  cookie(name: string): string | undefined { return undefined; }
}
export class Response<T> {
  readonly status: number;
  readonly body: T | undefined;
  readonly headers: Record<string, string>;
  private constructor(status: number, body: T | undefined, headers: Record<string, string>) { this.status = status; this.body = body; this.headers = headers; }
  static ok<T>(body: T): Response<T> { return new Response(200, body, {}); }
  static created<T>(body: T): Response<T> { return new Response(201, body, {}); }
  static noContent(): Response<never> { return new Response(204, undefined, {}) as Response<never>; }
  static status<T>(code: number, body?: T): Response<T> { return new Response(code, body, {}); }
}
`;

/**
 * Create an in-memory ts-morph project and run the full transform pipeline.
 * Automatically includes decorator stubs at /src/decorators.ts.
 */
export function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
  plugins?: TransformerPlugin[],
) {
  const project = new Project({ useInMemoryFileSystem: true });

  // Always include decorator stubs unless overridden
  if (!files['/src/decorators.ts']) {
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  }

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, outputPath, plugins);
}
