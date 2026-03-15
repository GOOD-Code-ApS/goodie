---
"@goodie-ts/hono": major
---

Extract `@goodie-ts/http` as an abstract HTTP package from `@goodie-ts/hono`. Route decorators (`@Controller`, `@Get`, `@Post`, etc.), `Request<T>`, `Response<T>`, `RouteMetadata`, and `ExceptionHandler` now live in the framework-agnostic `@goodie-ts/http` package. `@goodie-ts/hono` is now a thin adapter layer.
