/** Minimal decorator stubs for in-memory test projects. */
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
export function Get(path?: string) { return (t: any, c: any) => {} }
export function Post(path?: string) { return (t: any, c: any) => {} }
export function Put(path?: string) { return (t: any, c: any) => {} }
export function Delete(path?: string) { return (t: any, c: any) => {} }
export function Patch(path?: string) { return (t: any, c: any) => {} }
export function Log(opts?: any) { return (t: any, c: any) => {} }
`;
