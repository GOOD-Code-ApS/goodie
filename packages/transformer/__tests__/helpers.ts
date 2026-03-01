import { Project } from 'ts-morph';
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
`;

/**
 * Create an in-memory ts-morph project and run the full transform pipeline.
 * Automatically includes decorator stubs at /src/decorators.ts.
 */
export function createTestProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });

  // Always include decorator stubs unless overridden
  if (!files['/src/decorators.ts']) {
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  }

  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }

  return transformInMemory(project, outputPath);
}
