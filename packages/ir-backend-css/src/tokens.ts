/**
 * Compilateur de tokens, cible CSS (T5) : `tokens.json` + `tokens.dark.json`
 * → `tokens.css`. Variables CSS sous `:root`, mode sombre sous
 * `[data-theme="dark"]`, une classe utilitaire par token de typographie.
 *
 * Golden : `fixtures/design-system/expected/tokens.css`, à l'octet près.
 */

import { dimensionPx, fail, irError, ok } from "ir-core";
import type {
  DesignSystem,
  IRError,
  Result,
  ThemedDesignSystem,
  TokenEntry,
} from "ir-core";

export interface TokenCompilerOptions {
  /** Noms des fichiers sources, pour l'en-tête. */
  readonly sources: readonly string[];
}

type Json = Readonly<Record<string, unknown>>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Variable CSS : `$groupe.sous.nom` → `--groupe-sous-nom`. */
export const cssVariable = (entry: TokenEntry): string =>
  `--${entry.path.join("-")}`;

/** Classe de typographie : `$type.heading.lg` → `.type-heading-lg`. */
export const cssTypographyClass = (entry: TokenEntry): string =>
  `.${entry.path.join("-")}`;

/**
 * Index nom CSS → token, pour la décompilation (spec §9.1) : `space-md` →
 * `$space.md`. Deux tokens de même nom (`size.icon-md` et `size.icon.md`)
 * seraient indistinguables dans le code généré : E010 (loi 2).
 */
export function cssNameIndex(
  ds: DesignSystem,
): Result<ReadonlyMap<string, TokenEntry>> {
  const index = new Map<string, TokenEntry>();
  const errors: IRError[] = [];
  for (const entry of ds.tokens.values()) {
    if (!entry.referenceable || entry.path[0] === "bp") continue;
    const name = entry.path.join("-");
    const other = index.get(name);
    if (other === undefined) {
      index.set(name, entry);
      continue;
    }
    errors.push(
      irError(
        "E010",
        entry.path.join("."),
        `« ${entry.path.join(".")} » et « ${other.path.join(".")} » ont le même nom CSS « ${name} » : le code généré ne pourrait pas les distinguer (loi 2). Renommer l'un des deux. (compilateur de tokens CSS)`,
      ),
    );
  }
  return errors.length > 0 ? fail(errors) : ok(index);
}

export function compileTokensCss(
  ds: ThemedDesignSystem,
  options: TokenCompilerOptions,
): Result<string> {
  const index = cssNameIndex(ds.light);
  if (!index.ok) return fail(index.errors);
  const errors: IRError[] = [];
  const e010 = (entry: TokenEntry, message: string): void => {
    errors.push(
      irError(
        "E010",
        entry.path.join("."),
        `${message} (compilateur de tokens CSS)`,
      ),
    );
  };

  const variables = (
    system: DesignSystem,
    keys?: ReadonlySet<string>,
  ): string[] => {
    const lines: string[] = [];
    let previousGroup: string | undefined;
    for (const [key, entry] of system.tokens) {
      if (
        !entry.referenceable ||
        entry.path[0] === "bp" ||
        entry.type === "typography"
      )
        continue;
      if (keys !== undefined && !keys.has(key)) continue;
      const value = cssValue(entry);
      if (value === undefined) {
        e010(entry, `Type DTCG « ${entry.type} » sans traduction CSS`);
        continue;
      }
      const group = entry.path[0] ?? "";
      if (previousGroup !== undefined && group !== previousGroup)
        lines.push("");
      previousGroup = group;
      lines.push(`  ${cssVariable(entry)}: ${value};`);
    }
    return lines;
  };

  const out: string[] = [
    `/* Généré depuis ${options.sources.join(" + ")} par le compilateur de tokens, cible CSS. Ne pas éditer. */`,
    `/* Nommage : $groupe.sous.nom  ->  --groupe-sous-nom. Les primitives (${privateNames(ds.light)}) ne sont pas émises. */`,
    "",
    ":root {",
    ...variables(ds.light),
    "}",
  ];

  if (ds.dark !== undefined && ds.darkKeys.length > 0) {
    out.push(
      "",
      '[data-theme="dark"] {',
      ...variables(ds.dark, new Set(ds.darkKeys)),
      "}",
    );
  }

  const typography = [...ds.light.tokens.values()].filter(
    (e) => e.referenceable && e.type === "typography",
  );
  if (typography.length > 0) {
    out.push(
      "",
      "/* Tokens composites de typographie : une classe par token. Text.style: $type.heading.lg -> .type-heading-lg */",
      "",
    );
    const rows: {
      readonly name: string;
      readonly fields: readonly string[];
    }[] = [];
    for (const entry of typography) {
      const fields = typographyFields(entry);
      if (fields === undefined) {
        e010(
          entry,
          "Token de typographie incomplet : fontFamily, fontSize, lineHeight, fontWeight et letterSpacing sont requis",
        );
        continue;
      }
      rows.push({ name: cssTypographyClass(entry), fields });
    }
    out.push(...alignedRules(rows));
  }

  if (errors.length > 0) return fail(errors);
  return ok(out.join("\n") + "\n");
}

/** Noms des groupes privés, dernier segment, dans l'ordre du fichier. */
export function privateNames(ds: DesignSystem): string {
  return ds.privateGroups.map((g) => g.split(".").at(-1) ?? g).join(", ");
}

/**
 * Règles de typographie en colonnes : le sélecteur est complété à la largeur
 * du plus long, chaque champ sauf le dernier à la largeur du plus long.
 */
function alignedRules(
  rows: readonly {
    readonly name: string;
    readonly fields: readonly string[];
  }[],
): string[] {
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  const fieldCount = Math.max(...rows.map((r) => r.fields.length));
  const widths = Array.from({ length: fieldCount }, (_, i) =>
    Math.max(...rows.map((r) => r.fields[i]?.length ?? 0)),
  );
  return rows.map((r) => {
    const cells = r.fields.map((f, i) =>
      i < r.fields.length - 1 ? f.padEnd(widths[i] ?? 0) : f,
    );
    return `${r.name.padEnd(nameWidth)} { ${cells.join(" ")} }`;
  });
}

// ---------------------------------------------------------------------------
// Valeurs
// ---------------------------------------------------------------------------

export function cssValue(entry: TokenEntry): string | undefined {
  switch (entry.type) {
    case "dimension":
      return cssDimension(entry.value);
    case "number":
      return typeof entry.value === "number" ? String(entry.value) : undefined;
    case "color":
      return cssColor(entry.value);
    case "shadow":
      return cssShadow(entry.value);
    default:
      return undefined;
  }
}

function cssDimension(value: unknown): string | undefined {
  const px = dimensionPx(value);
  return px === undefined ? undefined : `${String(px)}px`;
}

/** `#RRGGBB` (hex du fichier, sinon calculé), ou `rgba(...)` si alpha < 1. */
export function cssColor(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const alpha = typeof value["alpha"] === "number" ? value["alpha"] : 1;
  const rgb = rgb255(value);
  if (alpha < 1) {
    return rgb === undefined
      ? undefined
      : `rgba(${rgb.join(", ")}, ${String(alpha)})`;
  }
  if (typeof value["hex"] === "string") return value["hex"];
  return rgb === undefined
    ? undefined
    : `#${rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

function rgb255(value: Json): readonly [number, number, number] | undefined {
  const c = value["components"];
  if (!Array.isArray(c) || c.length < 3) return undefined;
  const [r, g, b] = c;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number")
    return undefined;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function cssShadow(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const parts = ["offsetX", "offsetY", "blur", "spread"].map((k) =>
    cssDimension(value[k]),
  );
  const color = value["color"];
  if (parts.some((p) => p === undefined) || !isObject(color)) return undefined;
  const rgb = rgb255(color);
  if (rgb === undefined) return undefined;
  const alpha = typeof color["alpha"] === "number" ? color["alpha"] : 1;
  return `${parts.join(" ")} rgba(${rgb.join(", ")}, ${String(alpha)})`;
}

function typographyFields(entry: TokenEntry): readonly string[] | undefined {
  const v = entry.value;
  if (!isObject(v)) return undefined;
  const family = v["fontFamily"];
  const familyText = Array.isArray(family)
    ? family.map(String).join(", ")
    : typeof family === "string"
      ? family
      : undefined;
  const size = cssDimension(v["fontSize"]);
  const lineHeight =
    typeof v["lineHeight"] === "number"
      ? String(v["lineHeight"])
      : cssDimension(v["lineHeight"]);
  const weight =
    typeof v["fontWeight"] === "number" ? String(v["fontWeight"]) : undefined;
  const spacing = cssDimension(v["letterSpacing"]);
  if (
    familyText === undefined ||
    size === undefined ||
    lineHeight === undefined ||
    weight === undefined ||
    spacing === undefined
  ) {
    return undefined;
  }
  return [
    `font-family: ${familyText};`,
    `font-size: ${size};`,
    `line-height: ${lineHeight};`,
    `font-weight: ${weight};`,
    `letter-spacing: ${spacing};`,
  ];
}
