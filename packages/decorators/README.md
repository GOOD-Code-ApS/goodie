# @goodie-ts/decorators

Stage 3 decorators for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) compile-time dependency injection.

## Install

```bash
pnpm add @goodie-ts/decorators
```

## Overview

Provides the decorators you use to annotate your classes. These attach metadata via `Symbol.metadata` which the transformer reads at build time — they do **not** wire anything at runtime. No `reflect-metadata` required.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Singleton()` | class | Singleton-scoped bean |
| `@Injectable()` | class | Prototype-scoped bean (new instance per lookup) |
| `@Named(name)` | class | Qualifier for disambiguation |
| `@Eager()` | class | Instantiate at startup instead of on first access |
| `@Module({ imports? })` | class | Groups `@Provides` factory methods |
| `@Provides()` | method | Marks a method in a `@Module` as a bean factory |
| `@Inject(qualifier?)` | accessor field | Field injection |
| `@Optional()` | accessor field | Marks a field as optional (resolves to `undefined` if missing) |

## Usage

```typescript
import { Singleton, Inject, Optional } from '@goodie-ts/decorators';

@Singleton()
class UserService {
  @Inject() accessor userRepo!: UserRepository;
  @Optional() accessor logger?: Logger;

  getUsers() { return this.userRepo.findAll(); }
}
```

> **Note:** `@Inject` and `@Optional` require the `accessor` keyword — Stage 3 decorators do not support parameter decorators.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
