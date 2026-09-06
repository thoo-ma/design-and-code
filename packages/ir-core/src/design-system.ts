/**
 * Design system (spec §2, T4) : chargement pur d'un `tokens.json` au format
 * DTCG et d'un `icons.json`, résolution des alias `{chemin}`, table des
 * tokens référençables, breakpoints et jeu d'icônes.
 *
 * Aucune I/O : l'appelant lit les fichiers et passe les objets JSON.
 * Un design system invalide est E010 ; ce module n'invente jamais de valeur.
 */

import type { Token, TokenGroup } from "./ast.js";
import { fail, irError, ok } from "./errors.js";
import type { IRError, Result } from "./errors.js";

export interface TokenEntry {
  /** Chemin DTCG complet : `["color", "text", "primary"]`. */
  readonly path: readonly string[];
  /** `$type` DTCG, propre, hérité du groupe, ou celui de la cible d'un alias. */
  readonly type: string;
  /** Valeur résolue : tous les alias suivis, récursivement. */
  readonly value: unknown;
  /** Faux si un groupe parent porte `$extensions.ir.referenceable: false`. */
  readonly referenceable: boolean;
}

export interface DesignSystem {
  /** Clé : chemin joint par `.`, comme `color.text.primary`. */
  readonly tokens: ReadonlyMap<string, TokenEntry>;
  /** Groupe `bp` : nom → largeur minimale en u. */
  readonly breakpoints: ReadonlyMap<string, number>;
  /** `icons.json` : nom → nom par backend (`web`, `ios`, `android`). */
  readonly icons: ReadonlyMap<string, Readonly<Record<string, string>>>;
}

/** Type DTCG attendu pour chaque groupe référençable par l'IR (spec §2). */
export const EXPECTED_TYPE: Readonly<
  Record<Exclude<TokenGroup, "icon">, string>
> = {
  space: "dimension",
  size: "dimension",
  radius: "dimension",
  color: "color",
  type: "typography",
  shadow: "shadow",
  opacity: "number",
};

/** Le breakpoint de base (spec §4.7). */
export const BASE_BREAKPOINT = "compact";

export function tokenKey(token: Token): string {
  return [token.group, ...token.path].join(".");
}

export function lookupToken(
  ds: DesignSystem,
  token: Token,
): TokenEntry | undefined {
  return ds.tokens.get(tokenKey(token));
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

type Json = Readonly<Record<string, unknown>>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

interface RawEntry {
  readonly path: readonly string[];
  readonly type: string | undefined;
  readonly raw: unknown;
  readonly referenceable: boolean;
}

const ALIAS = /^\{([^{}]+)\}$/;

export function loadDesignSystem(
  tokens: unknown,
  icons?: unknown,
): Result<DesignSystem> {
  const errors: IRError[] = [];
  const e010 = (path: string, message: string): void => {
    errors.push(irError("E010", path, `${message} (design system)`));
  };

  if (!isObject(tokens)) {
    return fail([
      irError(
        "E010",
        "",
        "tokens.json doit être un objet JSON (design system).",
      ),
    ]);
  }

  // 1. Collecte des tokens bruts, avec héritage de $type et de referenceable.
  const raw = new Map<string, RawEntry>();
  const walk = (
    group: Json,
    path: readonly string[],
    type: string | undefined,
    referenceable: boolean,
  ): void => {
    for (const [key, child] of Object.entries(group)) {
      if (key.startsWith("$")) continue;
      const childPath = [...path, key];
      const dotted = childPath.join(".");
      if (!isObject(child)) {
        e010(
          dotted,
          `« ${dotted} » doit être un groupe ou un token (objet JSON), trouvé ${typeof child}.`,
        );
        continue;
      }
      const ownType =
        typeof child["$type"] === "string" ? child["$type"] : undefined;
      const childRef = referenceable && !isPrivate(child);
      if ("$value" in child) {
        raw.set(dotted, {
          path: childPath,
          type: ownType ?? type,
          raw: child["$value"],
          referenceable: childRef,
        });
      } else {
        walk(child, childPath, ownType ?? type, childRef);
      }
    }
  };
  walk(tokens, [], undefined, true);

  // 2. Résolution des alias, récursive, avec détection de cycle.
  const resolved = new Map<string, TokenEntry>();
  const resolving: string[] = [];
  const resolveEntry = (key: string): TokenEntry | undefined => {
    const done = resolved.get(key);
    if (done !== undefined) return done;
    const entry = raw.get(key);
    if (entry === undefined) return undefined;
    if (resolving.includes(key)) {
      e010(key, `Alias cyclique : ${[...resolving, key].join(" → ")}.`);
      return undefined;
    }
    resolving.push(key);
    let type = entry.type;
    const value = resolveValue(entry.raw, (target) => {
      const t = resolveEntry(target);
      if (t === undefined) {
        if (!raw.has(target))
          e010(key, `Alias {${target}} vers un token inexistant.`);
        return undefined;
      }
      type ??= t.type;
      return t.value;
    });
    resolving.pop();
    if (type === undefined) {
      e010(key, `Token sans $type, ni propre, ni hérité, ni par alias.`);
      return undefined;
    }
    const out: TokenEntry = {
      path: entry.path,
      type,
      value,
      referenceable: entry.referenceable,
    };
    resolved.set(key, out);
    return out;
  };
  for (const key of raw.keys()) resolveEntry(key);

  // 3. Breakpoints : groupe bp, dimensions en px.
  const breakpoints = new Map<string, number>();
  for (const entry of resolved.values()) {
    if (entry.path.length === 2 && entry.path[0] === "bp") {
      const name = entry.path[1] ?? "";
      const px = dimensionPx(entry.value);
      if (entry.type !== "dimension" || px === undefined) {
        e010(
          entry.path.join("."),
          `Le breakpoint « ${name} » doit être une dimension en px.`,
        );
        continue;
      }
      breakpoints.set(name, px);
    }
  }

  // 4. Icônes.
  const iconMap = new Map<string, Readonly<Record<string, string>>>();
  if (icons !== undefined) {
    const table = isObject(icons) ? icons["icons"] : undefined;
    if (!isObject(table)) {
      e010("icons", "icons.json doit contenir un objet « icons ».");
    } else {
      for (const [name, backends] of Object.entries(table)) {
        if (
          !isObject(backends) ||
          !Object.values(backends).every((v) => typeof v === "string")
        ) {
          e010(
            `icons.${name}`,
            `L'icône « ${name} » doit associer un nom (chaîne) à chaque backend.`,
          );
          continue;
        }
        const entry: Record<string, string> = {};
        for (const [backend, v] of Object.entries(backends))
          if (typeof v === "string") entry[backend] = v;
        iconMap.set(name, entry);
      }
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({ tokens: resolved, breakpoints, icons: iconMap });
}

function isPrivate(node: Json): boolean {
  const ext = node["$extensions"];
  if (!isObject(ext)) return false;
  const ir = ext["ir"];
  return isObject(ir) && ir["referenceable"] === false;
}

/** Suit les alias `{chemin}` dans une valeur, récursivement. */
function resolveValue(
  value: unknown,
  follow: (target: string) => unknown,
): unknown {
  if (typeof value === "string") {
    const m = ALIAS.exec(value);
    return m === null || m[1] === undefined ? value : follow(m[1]);
  }
  if (Array.isArray(value))
    return value.map((v: unknown) => resolveValue(v, follow));
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = resolveValue(v, follow);
    return out;
  }
  return value;
}

/** Valeur en u d'une dimension DTCG `{ value, unit: "px" }` (1 px = 1 u, spec §2). */
export function dimensionPx(value: unknown): number | undefined {
  if (!isObject(value)) return undefined;
  const n = value["value"];
  return typeof n === "number" && value["unit"] === "px" ? n : undefined;
}
