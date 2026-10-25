import ts from "typescript";
import type { BetaFeatureDefinition } from "./beta-feature-registry";

export function legacyFeatureKeys(source: string): string[] {
  const file = ts.createSourceFile("keys.ts", source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(
      (item) => item.name.getText(file) === "FEATURE_KEYS",
    );
    let value = declaration?.initializer;
    if (value && ts.isAsExpression(value)) value = value.expression;
    if (value && ts.isArrayLiteralExpression(value))
      return value.elements.map((item) => {
        if (!ts.isStringLiteral(item)) throw new Error("Legacy registry must remain literal");
        return item.text;
      });
  }
  throw new Error("Missing legacy feature registry");
}

/** Preserve quoted SQL strings, remove comments so commented-out gates don't pass. */
export function sqlWithoutComments(source: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quote) {
      out += c;
      if (c === quote) {
        if (source[i + 1] === quote) out += source[++i];
        else quote = "";
      }
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (source.slice(i, i + 2) === "--") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (source.slice(i, i + 2) === "/*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unclosed SQL comment");
      i = end + 1;
      out += " ";
    } else out += c;
  }
  return out;
}

function hasGuard(source: string, path: string, kind: "client" | "server", key: string) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const arg = node.arguments[kind === "server" ? 1 : 0];
      if (
        arg &&
        ts.isStringLiteral(arg) &&
        arg.text === key &&
        (kind === "server"
          ? name === "requireFeatureAccess" && ts.isAwaitExpression(node.parent)
          : name === "useFeatureAccess")
      )
        found = true;
    }
    if (
      kind === "client" &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === "BetaFeatureGate"
    ) {
      found ||= node.attributes.properties.some(
        (attr) =>
          ts.isJsxAttribute(attr) &&
          attr.name.getText(file) === "featureKey" &&
          !!attr.initializer &&
          ts.isStringLiteral(attr.initializer) &&
          attr.initializer.text === key,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export function checkBetaRegistrations(
  definitions: readonly BetaFeatureDefinition[],
  legacy: readonly string[],
  read: (path: string) => string,
) {
  const keys = new Set<string>();
  for (const feature of definitions) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(feature.key) ||
      legacy.includes(feature.key) ||
      keys.has(feature.key)
    )
      throw new Error("Invalid, duplicate or legacy Beta key");
    keys.add(feature.key);
    if (!feature.name || feature.name.length > 120 || feature.description.length > 500)
      throw new Error("Invalid feature metadata");
    if (!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(feature.registrationMigration))
      throw new Error("Forward registration migration required");
    const sql = sqlWithoutComments(read(feature.registrationMigration));
    const registrations = [
      ...sql.matchAll(
        /SELECT\s+public\.register_beta_feature\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*\)/gi,
      ),
    ];
    if (
      !registrations.some(
        (entry) =>
          entry
            .slice(1)
            .map((part) => part.replaceAll("''", "'"))
            .join("\0") === [feature.key, feature.name, feature.description].join("\0"),
      )
    )
      throw new Error("Missing exact SQL registration");
    if (
      !feature.entrypoints.length ||
      !feature.entrypoints.some((entry) => entry.kind === "server" || entry.kind === "sql")
    )
      throw new Error("Declare authoritative server/SQL admission");
    for (const entry of feature.entrypoints) {
      if (
        !/^(src|supabase)\/[a-zA-Z0-9_.$/-]+\.(tsx?|sql)$/.test(entry.path) ||
        entry.path.includes("..")
      )
        throw new Error("Unsafe entrypoint path");
      const code = read(entry.path);
      const guarded =
        entry.kind === "sql"
          ? new RegExp(
              `(?:current_user_can_use_feature\\(\\s*'${feature.key}'|can_use_feature\\(\\s*auth\\.uid\\(\\)\\s*,\\s*'${feature.key}')`,
            ).test(sqlWithoutComments(code))
          : hasGuard(code, entry.path, entry.kind, feature.key);
      if (!guarded) throw new Error(`Missing ${entry.kind} gate: ${entry.path}`);
    }
  }
}

export function assertNoUnknownFeatureGates(source: string, path: string, keys: readonly string[]) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const arg =
        name === "requireFeatureAccess"
          ? node.arguments[1]
          : name === "useFeatureAccess"
            ? node.arguments[0]
            : undefined;
      if (arg && ts.isStringLiteral(arg) && !keys.includes(arg.text))
        throw new Error(`Unregistered feature gate in ${path}: ${arg.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
