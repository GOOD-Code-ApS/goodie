---
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
---

feat: conditional bean registration with @ConditionalOnEnv, @ConditionalOnProperty, and @ConditionalOnMissingBean

Adds three new decorators for conditionally including or excluding beans at compile time:

- `@ConditionalOnEnv(envVar, value?)` -- include bean only when an environment variable is set (optionally matching a specific value)
- `@ConditionalOnProperty(key, value?)` -- include bean only when a config property exists (optionally matching a specific value)
- `@ConditionalOnMissingBean(Token)` -- include bean only when no other bean provides the given token (useful for default implementations)

Conditions are evaluated during graph building with AND semantics when multiple decorators are applied. The graph builder filters in order: env -> property -> missingBean. Error messages include hints when a required dependency was filtered out by a condition.
