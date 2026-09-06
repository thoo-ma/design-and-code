/**
 * Compilateur de tokens, cible SwiftUI (T5) : `tokens.json` +
 * `tokens.dark.json` → `Tokens.swift`. Un `enum T` imbriqué par groupe,
 * couleurs dynamiques clair/sombre, typographie décomposée en `Font` plus
 * métriques (`T.type.metrics`), jeu d'icônes (noms SF Symbols, ADR-005).
 *
 * Golden : `fixtures/design-system/expected/Tokens.swift`, à l'octet près.
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

const INDENT = "  ";

/** Arbre des groupes, dans l'ordre du fichier ; une feuille est un token. */
interface Group {
  readonly name: string;
  readonly path: readonly string[];
  readonly items: (Group | TokenEntry)[];
}

const isGroup = (item: Group | TokenEntry): item is Group => "items" in item;

const SWIFT_KEYWORDS = new Set([
  "associatedtype",
  "class",
  "deinit",
  "enum",
  "extension",
  "fileprivate",
  "func",
  "import",
  "init",
  "inout",
  "internal",
  "let",
  "open",
  "operator",
  "private",
  "protocol",
  "public",
  "rethrows",
  "static",
  "struct",
  "subscript",
  "typealias",
  "var",
  "break",
  "case",
  "continue",
  "default",
  "defer",
  "do",
  "else",
  "fallthrough",
  "for",
  "guard",
  "if",
  "in",
  "repeat",
  "return",
  "switch",
  "where",
  "while",
  "as",
  "catch",
  "false",
  "is",
  "nil",
  "super",
  "self",
  "Self",
  "throw",
  "throws",
  "true",
  "try",
  "Any",
]);

/** Identifiant Swift : mots-clés entre accents graves. */
export const swiftIdentifier = (name: string): string =>
  SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;

/** `chevron-right` → `chevronRight`, `heading.lg` → `headingLg`. */
export const camel = (segments: readonly string[]): string =>
  segments
    .flatMap((s) => s.split("-"))
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join("");

const WEIGHTS: Readonly<Record<number, string>> = {
  100: "ultraLight",
  200: "thin",
  300: "light",
  400: "regular",
  500: "medium",
  600: "semibold",
  700: "bold",
  800: "heavy",
  900: "black",
};

/** Littéral Double : toujours avec une partie décimale. */
const double = (n: number): string =>
  Number.isInteger(n) ? `${String(n)}.0` : String(n);

export function compileTokensSwift(
  ds: ThemedDesignSystem,
  options: TokenCompilerOptions,
): Result<string> {
  const errors: IRError[] = [];
  const report = (
    code: "E002" | "E010",
    path: string,
    message: string,
  ): void => {
    errors.push(
      irError(code, path, `${message} (compilateur de tokens SwiftUI)`),
    );
  };

  const root = buildTree(ds.light);
  const out: string[] = [
    `// Généré depuis ${options.sources.join(" + ")} par le compilateur de tokens, cible SwiftUI. Ne pas éditer.`,
    `// Nommage : $groupe.sous.nom -> T.groupe.sous.nom. Les primitives (${ds.light.privateGroups.map((g) => g.split(".").at(-1) ?? g).join(", ")}) ne sont pas émises.`,
    "// Le mode sombre est résolu par UIColor dynamique : l'IR et le code généré n'en savent rien.",
    "",
    "import SwiftUI",
    "",
    "enum T {",
  ];

  const dark = ds.dark ?? ds.light;
  for (const group of root.items) {
    if (!isGroup(group)) {
      report(
        "E010",
        group.path.join("."),
        "Un token à la racine du design system n'a pas de groupe",
      );
      continue;
    }
    out.push("", ...emitGroup(group, 1, dark, report));
  }

  if (ds.light.icons.size > 0) {
    const lines = [`${INDENT}enum icon {`];
    for (const [name, backends] of ds.light.icons) {
      const ios = backends["ios"];
      if (ios === undefined) {
        report(
          "E002",
          `icons.${name}`,
          `L'icône « ${name} » n'a pas de nom pour le backend ios`,
        );
        continue;
      }
      lines.push(
        `${INDENT}${INDENT}static let ${swiftIdentifier(camel([name]))} = ${JSON.stringify(ios)}`,
      );
    }
    lines.push(`${INDENT}}`);
    out.push("", ...lines);
  }

  out.push("}", "", ...SUPPORT);
  if (errors.length > 0) return fail(errors);
  return ok(out.join("\n") + "\n");
}

function buildTree(ds: DesignSystem): Group {
  const root: Group = { name: "", path: [], items: [] };
  for (const entry of ds.tokens.values()) {
    if (!entry.referenceable) continue;
    let node = root;
    for (const segment of entry.path.slice(0, -1)) {
      let next = node.items.find(
        (i): i is Group => isGroup(i) && i.name === segment,
      );
      if (next === undefined) {
        next = { name: segment, path: [...node.path, segment], items: [] };
        node.items.push(next);
      }
      node = next;
    }
    node.items.push(entry);
  }
  return root;
}

type Report = (code: "E002" | "E010", path: string, message: string) => void;

function emitGroup(
  group: Group,
  depth: number,
  dark: DesignSystem,
  report: Report,
): string[] {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  const lines = [`${pad}enum ${swiftIdentifier(group.name)} {`];

  // Alignement du `=` : parmi les couleurs directes du bloc.
  const colorNames = group.items
    .filter((i): i is TokenEntry => !isGroup(i) && i.type === "color")
    .map(leafName);
  const colorWidth =
    colorNames.length > 1 ? Math.max(...colorNames.map((n) => n.length)) : 0;

  for (const item of group.items) {
    if (isGroup(item)) {
      lines.push(...emitGroup(item, depth + 1, dark, report));
      continue;
    }
    const name = leafName(item);
    const key = item.path.join(".");
    switch (item.type) {
      case "dimension": {
        const px = dimensionPx(item.value);
        if (px === undefined) report("E010", key, "Dimension attendue en px");
        else lines.push(`${inner}static let ${name}: CGFloat = ${String(px)}`);
        break;
      }
      case "number":
        if (typeof item.value !== "number")
          report("E010", key, "Nombre attendu");
        else
          lines.push(
            `${inner}static let ${name}: Double = ${String(item.value)}`,
          );
        break;
      case "color": {
        const light = hex24(item.value);
        const darkEntry = dark.tokens.get(key);
        const darkHex =
          darkEntry === undefined ? light : hex24(darkEntry.value);
        if (light === undefined || darkHex === undefined)
          report("E010", key, "Couleur sans hex ni composantes srgb");
        else
          lines.push(
            `${inner}static let ${name.padEnd(colorWidth)} = Color(light: ${light}, dark: ${darkHex})`,
          );
        break;
      }
      case "typography": {
        const font = swiftFont(item.value);
        if (font === undefined)
          report(
            "E010",
            key,
            "Token de typographie incomplet : fontFamily, fontSize et fontWeight connus sont requis",
          );
        else lines.push(`${inner}static let ${name} = ${font}`);
        break;
      }
      case "shadow": {
        const darkEntry = dark.tokens.get(key);
        const shadow = swiftShadow(item.value, darkEntry?.value ?? item.value);
        if (shadow === undefined) report("E010", key, "Ombre incomplète");
        else lines.push(`${inner}static let ${name} = ${shadow}`);
        break;
      }
      default:
        report(
          "E010",
          key,
          `Type DTCG « ${item.type} » sans traduction SwiftUI`,
        );
    }
  }

  // Métriques de typographie du groupe de premier niveau (lineHeight, tracking), spec T5.
  const typography = leaves(group).filter((e) => e.type === "typography");
  if (depth === 1 && typography.length > 0) {
    const rows = typography.flatMap((e) => {
      const m = metrics(e.value);
      return m === undefined
        ? []
        : [{ name: camel(e.path.slice(group.path.length)), ...m }];
    });
    const nameWidth = Math.max(...rows.map((r) => r.name.length));
    const lhWidth = Math.max(
      ...rows.map((r) => `lineHeight: ${r.lineHeight},`.length),
    );
    lines.push(
      `${inner}// lineHeight et letterSpacing des tokens composites sont appliqués par le compilateur`,
      `${inner}// via .lineSpacing et .tracking sur chaque Text, à partir des valeurs ci-dessous.`,
      `${inner}enum metrics {`,
      ...rows.map(
        (r) =>
          `${inner}${INDENT}static let ${r.name.padEnd(nameWidth)} = (${`lineHeight: ${r.lineHeight},`.padEnd(lhWidth)} tracking: ${r.tracking})`,
      ),
      `${inner}}`,
    );
  }

  lines.push(`${pad}}`);
  return lines;
}

const leafName = (entry: TokenEntry): string =>
  swiftIdentifier(entry.path.at(-1) ?? "");

function leaves(group: Group): TokenEntry[] {
  return group.items.flatMap((i) => (isGroup(i) ? leaves(i) : [i]));
}

/** `0xRRGGBB` depuis le hex du fichier, sinon depuis les composantes srgb. */
export function hex24(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  if (
    typeof value["hex"] === "string" &&
    /^#[0-9A-Fa-f]{6}$/.test(value["hex"])
  )
    return `0x${value["hex"].slice(1).toUpperCase()}`;
  const rgb = rgb255(value);
  return rgb === undefined
    ? undefined
    : `0x${rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

function rgb255(value: Json): readonly [number, number, number] | undefined {
  const c = value["components"];
  if (!Array.isArray(c) || c.length < 3) return undefined;
  const [r, g, b] = c;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number")
    return undefined;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function swiftFont(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const family = value["fontFamily"];
  const first = Array.isArray(family) ? family[0] : family;
  const size = dimensionPx(value["fontSize"]);
  const weight =
    typeof value["fontWeight"] === "number"
      ? WEIGHTS[value["fontWeight"]]
      : undefined;
  if (typeof first !== "string" || size === undefined || weight === undefined)
    return undefined;
  return `Font.custom(${JSON.stringify(first)}, size: ${String(size)}).weight(.${weight})`;
}

function metrics(
  value: unknown,
): { lineHeight: string; tracking: string } | undefined {
  if (!isObject(value)) return undefined;
  const lh = value["lineHeight"];
  const tracking = dimensionPx(value["letterSpacing"]);
  if (typeof lh !== "number" || tracking === undefined) return undefined;
  return { lineHeight: double(lh), tracking: double(tracking) };
}

function swiftColorExpr(color: unknown): string | undefined {
  if (!isObject(color)) return undefined;
  const rgb = rgb255(color);
  if (rgb === undefined) return undefined;
  const alpha = typeof color["alpha"] === "number" ? color["alpha"] : 1;
  const base = rgb.every((c) => c === 0)
    ? "Color.black"
    : `Color(red: ${double(rgb[0] / 255)}, green: ${double(rgb[1] / 255)}, blue: ${double(rgb[2] / 255)})`;
  return alpha === 1 ? base : `${base}.opacity(${String(alpha)})`;
}

function swiftShadow(light: unknown, dark: unknown): string | undefined {
  if (!isObject(light) || !isObject(dark)) return undefined;
  const color = swiftColorExpr(light["color"]);
  const darkColor = swiftColorExpr(dark["color"]);
  const x = dimensionPx(light["offsetX"]);
  const y = dimensionPx(light["offsetY"]);
  const blur = dimensionPx(light["blur"]);
  if (
    color === undefined ||
    darkColor === undefined ||
    x === undefined ||
    y === undefined ||
    blur === undefined
  )
    return undefined;
  return `(color: ${color}, darkColor: ${darkColor}, x: CGFloat(${String(x)}), y: CGFloat(${String(y)}), blur: CGFloat(${String(blur)}))`;
}

/** Support minimal, une seule fois par projet (fixture expected/Tokens.swift). */
const SUPPORT: readonly string[] = [
  "// Support minimal, une seule fois par projet, fourni par le support library du backend.",
  "extension Color {",
  "  init(light: UInt32, dark: UInt32) {",
  "    self.init(UIColor { trait in",
  "      let hex = trait.userInterfaceStyle == .dark ? dark : light",
  "      return UIColor(",
  "        red:   CGFloat((hex >> 16) & 0xFF) / 255,",
  "        green: CGFloat((hex >> 8) & 0xFF) / 255,",
  "        blue:  CGFloat(hex & 0xFF) / 255,",
  "        alpha: 1)",
  "    })",
  "  }",
  "}",
];
