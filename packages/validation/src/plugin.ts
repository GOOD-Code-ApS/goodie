import type {
  EmitFilesContext,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Validation transformer plugin.
 *
 * **Scan phase** (`visitMethod`):
 * Scans `@Validated` methods for class-typed parameters and stores
 * `validatedMethodParams` metadata on the component so that core codegen
 * generates `MetadataRegistry.INSTANCE.registerMethodParam(...)` calls.
 * `ValidationInterceptor` reads these at runtime to know which arguments to validate.
 *
 * **Emit phase** (`emitFiles`):
 * Generates `schemas.ts` with pre-built Valibot schemas for all `@Introspected`
 * types. Schemas are registered statically via `ValiSchemaFactory.registerSchema()`
 * at module load time — Micronaut-style compile-time validation, no lazy building.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createValidationPlugin(): TransformerPlugin {
  return {
    name: 'validation',

    visitMethod(ctx: MethodVisitorContext): void {
      const hasValidated = ctx.decorators.some((d) => d.name === 'Validated');
      if (!hasValidated) return;

      const params = ctx.methodDeclaration.getParameters();
      if (params.length === 0) return;

      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const paramType = param.getType();
        const paramTypeName =
          param.getTypeNode()?.getText() ?? paramType.getText();

        // Skip primitives, primitive arrays, and HttpContext
        if (['string', 'number', 'boolean'].includes(paramTypeName)) continue;
        if (['string[]', 'number[]', 'boolean[]'].includes(paramTypeName))
          continue;
        if (paramTypeName === 'HttpContext') continue;

        // Class-typed param → register for validation
        const symbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
        if (!symbol) continue;
        const declarations = symbol.getDeclarations();
        if (declarations.length === 0) continue;

        const existing = (ctx.classMetadata.validatedMethodParams ??
          []) as Array<{
          methodName: string;
          typeClassName: string;
          typeImportPath: string;
          paramIndex: number;
        }>;
        existing.push({
          methodName: ctx.methodName,
          typeClassName: symbol.getName(),
          typeImportPath: declarations[0].getSourceFile().getFilePath(),
          paramIndex: i,
        });
        ctx.classMetadata.validatedMethodParams = existing;
      }
    },

    emitFiles(ctx: EmitFilesContext): void {
      if (ctx.typeRegistrations.length === 0) return;

      const sf = ctx.createSourceFile('schemas.ts');

      // Imports
      sf.addImportDeclaration({
        moduleSpecifier: 'valibot',
        namespaceImport: 'v',
      });
      sf.addImportDeclaration({
        moduleSpecifier: '@goodie-ts/validation',
        namedImports: hasCustomConstraints(ctx.typeRegistrations)
          ? ['ValiSchemaFactory', 'customConstraintRegistry']
          : ['ValiSchemaFactory'],
      });

      // Import each @Introspected class
      for (const reg of ctx.typeRegistrations) {
        sf.addImportDeclaration({
          moduleSpecifier: ctx.relativeImport(reg.importPath),
          namedImports: [reg.className],
        });
      }

      // Generate schema constants and registration
      const writer = sf.getProject().createWriter();

      for (const reg of ctx.typeRegistrations) {
        const fields = reg.fields as Array<{
          name: string;
          type: FieldTypeLike;
          decorators: Array<{ name: string; args: Record<string, unknown> }>;
        }>;

        const schemaVar = `${reg.className}$schema`;
        writer.write(`const ${schemaVar} = v.object(`).block(() => {
          for (const field of fields) {
            writer.writeLine(
              `${field.name}: ${buildFieldCode(field.type, field.decorators)},`,
            );
          }
        });
        writer.write(');').newLine();
        writer.writeLine(
          `ValiSchemaFactory.registerSchema(${reg.className}, ${schemaVar} as v.GenericSchema);`,
        );
        writer.blankLine();
      }

      sf.addStatements(writer.toString());
    },
  };
}

// ── Schema code generation helpers ──────────────────────────────────────

interface FieldTypeLike {
  kind: string;
  type?: string;
  value?: string;
  elementType?: FieldTypeLike;
  className?: string;
  types?: FieldTypeLike[];
  inner?: FieldTypeLike;
}

/**
 * Build the complete Valibot code expression for a field, applying constraints
 * to the inner type BEFORE wrapping with optional/nullable.
 *
 * e.g. `optional(string)` + `@MaxLength(255)` → `v.optional(v.pipe(v.string(), v.maxLength(255)))`
 */
function buildFieldCode(
  type: FieldTypeLike,
  decorators: Array<{ name: string; args: Record<string, unknown> }>,
): string {
  if (type.kind === 'optional') {
    const inner = applyConstraintCode(fieldTypeToCode(type.inner!), decorators);
    return `v.optional(${inner})`;
  }
  if (type.kind === 'nullable') {
    const inner = applyConstraintCode(fieldTypeToCode(type.inner!), decorators);
    return `v.nullable(${inner})`;
  }
  return applyConstraintCode(fieldTypeToCode(type), decorators);
}

/** Map a FieldType tree to a Valibot code expression string (no constraints). */
function fieldTypeToCode(type: FieldTypeLike): string {
  switch (type.kind) {
    case 'primitive':
      return primitiveToCode(type.type!);
    case 'literal':
      return literalToCode(type.value!);
    case 'array':
      return `v.array(${fieldTypeToCode(type.elementType!)})`;
    case 'reference':
      return `${type.className!}$schema`;
    case 'union': {
      const members = type.types!.map((t) => fieldTypeToCode(t));
      if (members.length === 1) return members[0];
      return `v.union([${members.join(', ')}])`;
    }
    case 'optional':
      return `v.optional(${fieldTypeToCode(type.inner!)})`;
    case 'nullable':
      return `v.nullable(${fieldTypeToCode(type.inner!)})`;
    default:
      return 'v.unknown()';
  }
}

function primitiveToCode(typeName: string): string {
  switch (typeName) {
    case 'string':
      return 'v.string()';
    case 'number':
      return 'v.number()';
    case 'boolean':
      return 'v.boolean()';
    default:
      return 'v.unknown()';
  }
}

function literalToCode(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return `v.literal(${value})`;
  }
  if (value === 'true') return 'v.literal(true)';
  if (value === 'false') return 'v.literal(false)';
  const num = Number(value);
  if (!Number.isNaN(num)) return `v.literal(${value})`;
  return 'v.unknown()';
}

/** Wrap a schema expression with constraint actions via v.pipe(). */
function applyConstraintCode(
  schemaExpr: string,
  decorators: Array<{ name: string; args: Record<string, unknown> }>,
): string {
  const actions: string[] = [];

  for (const dec of decorators) {
    const result = constraintToCode(dec);
    if (result) actions.push(...result);
  }

  if (actions.length === 0) return schemaExpr;
  return `v.pipe(${schemaExpr}, ${actions.join(', ')})`;
}

function constraintToCode(dec: {
  name: string;
  args: Record<string, unknown>;
}): string[] | undefined {
  const val = dec.args.value;

  switch (dec.name) {
    case 'MinLength':
      return [`v.minLength(${val})`];
    case 'MaxLength':
      return [`v.maxLength(${val})`];
    case 'Min':
      return [`v.minValue(${val})`];
    case 'Max':
      return [`v.maxValue(${val})`];
    case 'Pattern':
      return [`v.regex(new RegExp(${JSON.stringify(val)}))`];
    case 'NotBlank':
      return [
        `v.check((s: string) => s.trim().length > 0, 'Must not be blank')`,
      ];
    case 'Email':
      return ['v.email()'];
    case 'Size': {
      const min = val;
      const max = dec.args.value2;
      return [`v.minLength(${min})`, `v.maxLength(${max})`];
    }
    default:
      // Custom constraint via createConstraint() — look up from runtime registry
      return [
        `v.check(customConstraintRegistry.get(${JSON.stringify(dec.name)})!, "Custom constraint '${dec.name}' failed")`,
      ];
  }
}

/** Check if any type registration has a non-built-in constraint decorator. */
function hasCustomConstraints(
  typeRegistrations: ReadonlyArray<{ fields: unknown[] }>,
): boolean {
  const builtIn = new Set([
    'MinLength',
    'MaxLength',
    'Min',
    'Max',
    'Pattern',
    'NotBlank',
    'Email',
    'Size',
  ]);
  for (const reg of typeRegistrations) {
    for (const field of reg.fields as Array<{
      decorators: Array<{ name: string }>;
    }>) {
      for (const dec of field.decorators) {
        if (!builtIn.has(dec.name)) return true;
      }
    }
  }
  return false;
}
