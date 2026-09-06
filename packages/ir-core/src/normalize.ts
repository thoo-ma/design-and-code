/**
 * Forme normale `N` (spec §6).
 *
 * Fonction pure et totale : elle rend un nouvel arbre et la liste des
 * avertissements W001 (fill-in-hug normalisé) et W003 (surcharge sans effet
 * supprimée). Elle n'échoue jamais sur un AST bien typé.
 *
 * Les règles sont écrites sur une vue générique des propriétés (un
 * dictionnaire), puis le nœud typé est reconstruit. Les règles ne font que
 * retirer une clé, réordonner les clés, ou remplacer une valeur par une
 * valeur du même type ; les conversions en fin de règle sont donc sûres.
 */

import type {
  Node,
  NodeType,
  Pad,
  Screen,
  Size,
  StackNode,
  Token,
} from "./ast.js";
import { irError } from "./errors.js";
import type { IRError } from "./errors.js";
import { PROP_SPECS } from "./props.js";
import { overridesOf, propsOf, withProps } from "./props-view.js";
import type { GenericOverride, Props } from "./props-view.js";

export interface Normalized {
  readonly screen: Screen;
  readonly warnings: readonly IRError[];
}

/** Nom du breakpoint de base dans les calculs internes (spec §4.7 : `compact`). */
const BASE = "";

export function normalize(screen: Screen): Normalized {
  const warnings: IRError[] = [];
  let root = rule1(screen.root, undefined, undefined, [], "", warnings);
  root = mapTree(root, (node) => rule2(node));
  root = mapTree(root, (node, path) => rule3(node, path, warnings));
  root = mapTree(root, (node) => rule5(node));
  root = rule6(root);
  root = mapTree(root, (node) => rule7(node));
  return { screen: { name: screen.name, root }, warnings };
}

// ---------------------------------------------------------------------------
// Parcours
// ---------------------------------------------------------------------------

function mapTree(
  node: Node,
  f: (node: Node, path: string) => Node,
  indices: readonly number[] = [],
  parentPath = "",
): Node {
  const path = pathOf(node, indices, parentPath);
  const mapped = f(node, path);
  if (mapped.type !== "Stack") return mapped;
  return {
    ...mapped,
    children: mapped.children.map((child, k) =>
      mapTree(child, f, [...indices, k], path),
    ),
  };
}

/** Même convention que le parseur : `#id`, sinon `Type[index]`. */
function pathOf(
  node: Node,
  indices: readonly number[],
  parentPath: string,
): string {
  const segment =
    node.id ?? `${node.type}[${String(indices[indices.length - 1] ?? 0)}]`;
  return parentPath === "" ? segment : `${parentPath}/${segment}`;
}

// ---------------------------------------------------------------------------
// Valeurs : défauts (§4), égalité sémantique, résolution par breakpoint
// ---------------------------------------------------------------------------

const NONE: Token<"space"> = { group: "space", path: ["none"] };

const DEFAULTS: Props = {
  w: { kind: "hug" },
  h: { kind: "hug" },
  role: { kind: "none" },
  gap: NONE,
  pad: NONE,
  mainAlign: "start",
  crossAlign: "start",
  overflow: "visible",
  align: "start",
  fit: "cover",
};

function isSize(v: unknown): v is Size {
  return typeof v === "object" && v !== null && "kind" in v;
}

function isToken(v: unknown): v is Token {
  return typeof v === "object" && v !== null && "group" in v && "path" in v;
}

function tokenEquals(a: Token, b: Token): boolean {
  return (
    a.group === b.group &&
    a.path.length === b.path.length &&
    a.path.every((s, i) => s === b.path[i])
  );
}

/** Règle 7, appliquée en cascade. */
function reducePad(pad: Pad): Pad {
  if (!Array.isArray(pad)) return pad;
  if (pad.length === 4) {
    const [t, r, b, l] = pad;
    return tokenEquals(t, b) && tokenEquals(r, l) ? reducePad([t, r]) : pad;
  }
  const [a, b] = pad;
  return tokenEquals(a, b) ? a : pad;
}

function isPad(v: unknown): v is Pad {
  return isToken(v) || (Array.isArray(v) && v.every(isToken));
}

/** Égalité structurelle de valeurs JSON, `pad` comparé sous forme réduite. */
function valueEquals(key: string, a: unknown, b: unknown): boolean {
  if (key === "pad" && isPad(a) && isPad(b))
    return deepEqual(reducePad(a), reducePad(b));
  return deepEqual(a, b);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x: unknown, i) => deepEqual(x, b[i]))
    );
  }
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null
  ) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every((k) => k in b && deepEqual(propsOf(a)[k], propsOf(b)[k]))
    );
  }
  return false;
}

/** Propriétés effectives à un breakpoint : base recouverte par la surcharge. */
function effective(
  props: Props,
  overrides: readonly GenericOverride[],
  bp: string,
): Props {
  if (bp === BASE) return props;
  const o = overrides.find((x) => x.breakpoint === bp);
  return o === undefined ? props : { ...props, ...o.props };
}

/** Résolution d'une propriété : valeur effective, sinon défaut (§4). */
function resolve(eff: Props, key: string): unknown {
  const v = eff[key];
  if (v !== undefined) return v;
  if (key === "truncate") return eff["maxLines"] === undefined ? "none" : "end";
  return DEFAULTS[key];
}

function breakpointsOf(
  ...lists: (readonly GenericOverride[])[]
): readonly string[] {
  const out = new Set<string>([BASE]);
  for (const list of lists) for (const o of list) out.add(o.breakpoint);
  return [...out];
}

function without(props: Props, key: string): Props {
  const { [key]: _dropped, ...rest } = props;
  void _dropped;
  return rest;
}

// ---------------------------------------------------------------------------
// Règle 1 — fill-in-hug, breakpoint par breakpoint
// ---------------------------------------------------------------------------

function rule1(
  node: Node,
  parent: StackNode | undefined,
  grand: StackNode | undefined,
  indices: readonly number[],
  parentPath: string,
  warnings: IRError[],
): Node {
  const path = pathOf(node, indices, parentPath);
  let current = node;
  if (parent !== undefined && current.type !== "Icon") {
    current = fillInHug(current, parent, grand, path, warnings);
  }
  if (current.type !== "Stack") return current;
  const stack = current;
  return {
    ...stack,
    children: stack.children.map((child, k) =>
      rule1(child, stack, parent, [...indices, k], path, warnings),
    ),
  };
}

function sizeAt(node: Node, axis: "w" | "h", bp: string): Size {
  const v = effective(propsOf(node.props), overridesOf(node), bp)[axis];
  return isSize(v) ? v : { kind: "hug" };
}

/** Le grand-parent étire-t-il `parent` sur `axis` (spec §4.2, crossAlign: stretch) ? */
function stretched(
  parent: StackNode,
  grand: StackNode | undefined,
  axis: "w" | "h",
  bp: string,
): boolean {
  if (grand === undefined) return false;
  const g = effective(propsOf(grand.props), overridesOf(grand), bp);
  const cross = g["dir"] === "h" ? "h" : "w";
  return (
    axis === cross &&
    resolve(g, "crossAlign") === "stretch" &&
    sizeAt(parent, axis, bp).kind === "hug"
  );
}

function fillInHug(
  node: Node,
  parent: StackNode,
  grand: StackNode | undefined,
  path: string,
  warnings: IRError[],
): Node {
  let props = propsOf(node.props);
  let overrides = overridesOf(node);
  const bps = breakpointsOf(
    overrides,
    overridesOf(parent),
    grand === undefined ? [] : overridesOf(grand),
  );

  for (const axis of ["w", "h"] as const) {
    const values = new Map<string, Size>();
    const changedAt: string[] = [];
    for (const bp of bps) {
      const child = sizeAt(node, axis, bp);
      const parentSize = sizeAt(parent, axis, bp);
      if (
        child.kind === "fill" &&
        parentSize.kind === "hug" &&
        !stretched(parent, grand, axis, bp)
      ) {
        values.set(bp, { kind: "hug" });
        changedAt.push(bp);
      } else {
        values.set(bp, child);
      }
    }
    if (changedAt.length === 0) continue;

    // Réencodage : la base prend la valeur de `compact`, chaque surcharge ne
    // porte l'axe que si sa valeur diffère de la base.
    const base = values.get(BASE) ?? { kind: "hug" };
    props = { ...props, [axis]: base };
    overrides = bps
      .filter((bp) => bp !== BASE)
      .map((bp) => {
        const existing = overrides.find((o) => o.breakpoint === bp) ?? {
          breakpoint: bp,
          props: {},
        };
        const value = values.get(bp) ?? base;
        const next = deepEqual(value, base)
          ? without(existing.props, axis)
          : { ...existing.props, [axis]: value };
        return { breakpoint: bp, props: next };
      })
      .filter(
        (o) =>
          Object.keys(o.props).length > 0 ||
          overrides.some((x) => x.breakpoint === o.breakpoint),
      );

    const where = changedAt
      .map((bp) => (bp === BASE ? "compact" : bp))
      .join(", ");
    warnings.push(
      irError(
        "W001",
        path,
        `${axis}: fill dans un parent hug (${where}), normalisé en hug. Mettre le parent en fill ou fixed si l'enfant doit remplir.`,
      ),
    );
  }
  return withProps(node, props, overrides);
}

// ---------------------------------------------------------------------------
// Règles 2 et 4 — défauts de la base, résolus à chaque breakpoint
// ---------------------------------------------------------------------------

function rule2(node: Node): Node {
  const props = propsOf(node.props);
  const overrides = overridesOf(node);
  const bps = breakpointsOf(overrides);
  let out = props;
  for (const key of Object.keys(props)) {
    const redundant = bps.every((bp) =>
      valueEquals(
        key,
        resolve(effective(props, overrides, bp), key),
        resolve(effective(without(props, key), overrides, bp), key),
      ),
    );
    if (redundant) out = without(out, key);
  }
  return withProps(node, out, overrides);
}

// ---------------------------------------------------------------------------
// Règle 3 — surcharges sans effet
// ---------------------------------------------------------------------------

function rule3(node: Node, path: string, warnings: IRError[]): Node {
  const props = propsOf(node.props);
  const overrides = overridesOf(node);
  const kept: GenericOverride[] = [];
  for (const o of overrides) {
    let next = o.props;
    for (const key of Object.keys(o.props)) {
      const withKey = resolve(
        effective(
          props,
          [{ breakpoint: o.breakpoint, props: next }],
          o.breakpoint,
        ),
        key,
      );
      const withoutKey = resolve(
        effective(
          props,
          [{ breakpoint: o.breakpoint, props: without(next, key) }],
          o.breakpoint,
        ),
        key,
      );
      if (valueEquals(key, withKey, withoutKey)) next = without(next, key);
    }
    if (Object.keys(next).length === 0) {
      warnings.push(
        irError(
          "W003",
          path,
          `@${o.breakpoint} ne change rien par rapport à la base, supprimée.`,
        ),
      );
    } else {
      kept.push({ breakpoint: o.breakpoint, props: next });
    }
  }
  return withProps(node, props, kept);
}

// ---------------------------------------------------------------------------
// Règle 5 — ordre canonique des clés (celui de PROP_SPECS, donc de §4)
// ---------------------------------------------------------------------------

function ordered(type: NodeType, props: Props): Props {
  const out: Record<string, unknown> = {};
  for (const spec of PROP_SPECS[type]) {
    const v = props[spec.key];
    if (v !== undefined) out[spec.key] = v;
  }
  return out;
}

function rule5(node: Node): Node {
  return withProps(
    node,
    ordered(node.type, propsOf(node.props)),
    overridesOf(node).map((o) => ({
      breakpoint: o.breakpoint,
      props: ordered(node.type, o.props),
    })),
  );
}

// ---------------------------------------------------------------------------
// Règle 6 — identifiants par hash de chemin
// ---------------------------------------------------------------------------

/** FNV-1a 32 bits, huit chiffres hexadécimaux. */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function rule6(root: Node): Node {
  const used = new Set<string>();
  const collect = (node: Node): void => {
    if (node.id !== undefined) used.add(node.id);
    if (node.type === "Stack") node.children.forEach(collect);
  };
  collect(root);

  const assign = (node: Node, indices: readonly number[]): Node => {
    let current = node;
    if (current.id === undefined) {
      let id = `n_${fnv1a32(`${current.type}:${indices.join("/")}`)}`;
      while (used.has(id)) id += `_${indices.join("_")}`;
      used.add(id);
      current = { ...current, id };
    }
    if (current.type !== "Stack") return current;
    return {
      ...current,
      children: current.children.map((child, k) =>
        assign(child, [...indices, k]),
      ),
    };
  };
  return assign(root, []);
}

// ---------------------------------------------------------------------------
// Règle 7 — padding
// ---------------------------------------------------------------------------

function reducePads(props: Props): Props {
  const pad = props["pad"];
  return isPad(pad) ? { ...props, pad: reducePad(pad) } : props;
}

function rule7(node: Node): Node {
  return withProps(
    node,
    reducePads(propsOf(node.props)),
    overridesOf(node).map((o) => ({
      breakpoint: o.breakpoint,
      props: reducePads(o.props),
    })),
  );
}
