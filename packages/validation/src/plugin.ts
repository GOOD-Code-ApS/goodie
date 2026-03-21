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
 * at module load time — compile-time validation, no lazy building.
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

      // Imports — only registerSchema, no Valibot
      sf.addImportDeclaration({
        moduleSpecifier: '@goodie-ts/validation',
        namedImports: ['registerSchema'],
      });

      // Build alias map for duplicate class names
      const aliasMap = buildAliasMap(ctx.typeRegistrations);

      // Import each @Introspected class (with alias if name collides)
      for (const reg of ctx.typeRegistrations) {
        const alias = aliasMap.get(reg);
        sf.addImportDeclaration({
          moduleSpecifier: ctx.relativeImport(reg.importPath),
          namedImports: alias
            ? [{ name: reg.className, alias }]
            : [reg.className],
        });
      }

      // Topologically sort registrations so referenced types are registered
      // before the types that reference them — no lazy resolution needed.
      const sorted = topoSortRegistrations(ctx.typeRegistrations);

      // Generate registerSchema() calls with plain field descriptors
      const writer = sf.getProject().createWriter();

      for (const reg of sorted) {
        const localName = aliasMap.get(reg) ?? reg.className;
        const fieldsJson = JSON.stringify(reg.fields);
        writer.writeLine(`registerSchema(${localName}, ${fieldsJson});`);
      }

      sf.addStatements(writer.toString());
    },
  };
}

interface TypeReg {
  className: string;
  importPath: string;
  fields: unknown[];
}

/** Subset of FieldType used only for walking reference dependencies during topological sort. */
interface FieldTypeNode {
  kind: string;
  className?: string;
  elementType?: FieldTypeNode;
  types?: FieldTypeNode[];
  inner?: FieldTypeNode;
}

/**
 * Topologically sort type registrations so that referenced types are
 * emitted before the types that reference them. All types are known
 * at compile time, so ordering is deterministic.
 */
function topoSortRegistrations<T extends TypeReg>(
  registrations: ReadonlyArray<T>,
): T[] {
  const byName = new Map<string, T>();
  for (const reg of registrations) {
    byName.set(reg.className, reg);
  }

  const sorted: T[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(reg: T): void {
    if (visited.has(reg.className)) return;
    if (visiting.has(reg.className)) return; // circular — break the cycle
    visiting.add(reg.className);

    for (const refName of collectReferences(reg.fields)) {
      const dep = byName.get(refName);
      if (dep) visit(dep);
    }

    visiting.delete(reg.className);
    visited.add(reg.className);
    sorted.push(reg);
  }

  for (const reg of registrations) {
    visit(reg);
  }

  return sorted;
}

/** Walk a fields array and collect all referenced class names. */
function collectReferences(fields: unknown[]): string[] {
  const refs: string[] = [];
  for (const field of fields as Array<{ type: FieldTypeNode }>) {
    collectFieldTypeRefs(field.type, refs);
  }
  return refs;
}

function collectFieldTypeRefs(type: FieldTypeNode, refs: string[]): void {
  switch (type.kind) {
    case 'reference':
      if (type.className) refs.push(type.className);
      break;
    case 'array':
      if (type.elementType) collectFieldTypeRefs(type.elementType, refs);
      break;
    case 'union':
      if (type.types) {
        for (const t of type.types) collectFieldTypeRefs(t, refs);
      }
      break;
    case 'optional':
    case 'nullable':
      if (type.inner) collectFieldTypeRefs(type.inner, refs);
      break;
  }
}

/**
 * Build an alias map for type registrations with duplicate class names.
 * Only entries that collide get aliases (e.g. `CreateUser` → `CreateUser$1`).
 */
function buildAliasMap(
  registrations: ReadonlyArray<TypeReg>,
): Map<TypeReg, string> {
  const nameCount = new Map<string, number>();
  for (const reg of registrations) {
    nameCount.set(reg.className, (nameCount.get(reg.className) ?? 0) + 1);
  }

  const aliases = new Map<TypeReg, string>();
  const seen = new Map<string, number>();
  for (const reg of registrations) {
    if ((nameCount.get(reg.className) ?? 0) > 1) {
      const idx = (seen.get(reg.className) ?? 0) + 1;
      seen.set(reg.className, idx);
      aliases.set(reg, `${reg.className}$${idx}`);
    }
  }
  return aliases;
}
