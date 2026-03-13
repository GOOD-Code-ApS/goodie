import type {
  ClassVisitorContext,
  MethodVisitorContext,
  TransformerPlugin,
} from '@goodie-ts/transformer';

/**
 * Security transformer plugin (scan-phase only).
 *
 * Scans @Secured on classes and methods, and @Anonymous on methods.
 * Stores security metadata on the bean definition for runtime use
 * by the SecurityInterceptor.
 *
 * Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.
 */
export default function createSecurityPlugin(): TransformerPlugin {
  return {
    name: 'security',

    visitClass(ctx: ClassVisitorContext): void {
      const hasSecured = ctx.decorators.some((d) => d.name === 'Secured');
      if (!hasSecured) return;

      // Extract roles from the AST — @Secured('ADMIN') or @Secured(['ADMIN', 'USER'])
      const securedDec = ctx.classDeclaration
        .getDecorators()
        .find((d) => d.getName() === 'Secured');
      const classRoles = securedDec
        ? extractRolesFromArgs(securedDec.getArguments())
        : [];

      ctx.metadata.security = {
        classRoles,
        anonymousMethods: [] as string[],
      };
    },

    visitMethod(ctx: MethodVisitorContext): void {
      const isAnonymous = ctx.decorators.some((d) => d.name === 'Anonymous');
      if (isAnonymous) {
        const security = (ctx.classMetadata.security ?? {
          classRoles: [],
          anonymousMethods: [],
        }) as { classRoles: string[]; anonymousMethods: string[] };
        security.anonymousMethods.push(ctx.methodName);
        ctx.classMetadata.security = security;
      }
    },
  };
}

function extractRolesFromArgs(args: { getText(): string }[]): string[] {
  if (args.length === 0) return [];
  const text = args[0].getText().trim();

  // @Secured('ADMIN') — single string
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return [text.slice(1, -1)];
  }

  // @Secured(['ADMIN', 'USER']) — array literal
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1);
    return inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        if (
          (s.startsWith("'") && s.endsWith("'")) ||
          (s.startsWith('"') && s.endsWith('"'))
        ) {
          return s.slice(1, -1);
        }
        return s;
      });
  }

  return [];
}
