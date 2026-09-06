/**
 * Layout de référence (spec §5.2, T6) : contraintes descendantes, tailles
 * remontantes. `measure` puis `arrange`, en fonctions pures ; la mesure de
 * texte est un paramètre (`platform`). Les erreurs sont des valeurs : E007
 * pour un `fill` sous contrainte infinie, E002 pour un token irrésolu, E010
 * pour un token de typographie inutilisable.
 */

import {
  activeBreakpoint,
  dimensionPx,
  fail,
  irError,
  lookupToken,
  ok,
  resolveBreakpoint,
} from "ir-core";
import type {
  IRError,
  Length,
  Node,
  Pad,
  Result,
  Screen,
  Size,
  StackNode,
  Token,
} from "ir-core";

import type { Geometry, LayoutOptions, Rect, Typography } from "./types.js";

type Axis = "w" | "h";
const other = (a: Axis): Axis => (a === "w" ? "h" : "w");

/** Mode imposé par le parent : `hug` provisoire sur cross (étapes 1 à 3), `fill` à l'étape 6. */
interface Forced {
  readonly axis: Axis;
  readonly mode: "hug" | "fill";
}

interface Measured {
  readonly node: Node;
  readonly key: string;
  readonly w: number;
  readonly h: number;
  readonly children: readonly Measured[];
}

const EPSILON = 1e-9;

export function layout(
  screen: Screen,
  options: LayoutOptions,
): Result<Geometry> {
  const breakpoint = activeBreakpoint(options.designSystem, options.viewport.w);
  const flat = resolveBreakpoint(screen, breakpoint);
  const ctx = new Layout(options);
  // La racine reçoit le viewport là où elle est fixed ou fill, et ∞ là où
  // elle est hug : c'est alors son contenu qui décide (§5.2).
  const constraint = (axis: Axis, value: number): number =>
    ctx.rootMode(flat.root, axis) === "hug" ? Number.POSITIVE_INFINITY : value;
  const measured = ctx.measure(
    flat.root,
    constraint("w", options.viewport.w),
    constraint("h", options.viewport.h),
    [],
    "",
  );
  const out = new Map<string, Rect>();
  ctx.arrange(measured, 0, 0, out);
  return ctx.errors.length > 0 ? fail(ctx.errors) : ok(out);
}

class Layout {
  readonly errors: IRError[] = [];

  constructor(private readonly options: LayoutOptions) {}

  // -- résolution des valeurs -----------------------------------------------

  private length(value: Length, path: string): number {
    if (typeof value === "number") return value;
    return this.token(value, path) ?? 0;
  }

  private token(token: Token, path: string): number | undefined {
    const entry = lookupToken(this.options.designSystem, token);
    const px = entry === undefined ? undefined : dimensionPx(entry.value);
    if (px === undefined) {
      this.report(
        "E002",
        path,
        `Token $${[token.group, ...token.path].join(".")} irrésolu en longueur au layout.`,
      );
    }
    return px;
  }

  /** Un diagnostic par cause et par nœud : une valeur peut être lue deux fois. */
  private report(
    code: "E002" | "E007" | "E010",
    path: string,
    message: string,
  ): void {
    if (
      this.errors.some(
        (e) => e.code === code && e.path === path && e.message === message,
      )
    )
      return;
    this.errors.push(irError(code, path, message));
  }

  private typography(token: Token, path: string): Typography {
    const entry = lookupToken(this.options.designSystem, token);
    const v = entry?.value;
    const fallback: Typography = {
      fontFamily: [],
      fontSize: 0,
      lineHeight: 1,
      fontWeight: 400,
      letterSpacing: 0,
    };
    if (typeof v !== "object" || v === null) {
      this.errors.push(
        irError(
          "E002",
          path,
          `Token $${[token.group, ...token.path].join(".")} irrésolu au layout.`,
        ),
      );
      return fallback;
    }
    const o = v as Readonly<Record<string, unknown>>;
    const fontSize = dimensionPx(o["fontSize"]);
    const letterSpacing = dimensionPx(o["letterSpacing"]) ?? 0;
    const family = o["fontFamily"];
    if (fontSize === undefined || typeof o["lineHeight"] !== "number") {
      this.errors.push(
        irError(
          "E010",
          path,
          `Token $${[token.group, ...token.path].join(".")} : fontSize (px) et lineHeight (nombre) sont requis.`,
        ),
      );
      return fallback;
    }
    return {
      fontFamily: Array.isArray(family)
        ? family.map(String)
        : typeof family === "string"
          ? [family]
          : [],
      fontSize,
      lineHeight: o["lineHeight"],
      fontWeight: typeof o["fontWeight"] === "number" ? o["fontWeight"] : 400,
      letterSpacing,
    };
  }

  private pad(
    pad: Pad | undefined,
    path: string,
  ): readonly [number, number, number, number] {
    if (pad === undefined) return [0, 0, 0, 0];
    if ("group" in pad) return this.same(this.token(pad, path) ?? 0);
    if (pad.length === 2) {
      const v = this.token(pad[0], path) ?? 0;
      const h = this.token(pad[1], path) ?? 0;
      return [v, h, v, h];
    }
    return [
      this.token(pad[0], path) ?? 0,
      this.token(pad[1], path) ?? 0,
      this.token(pad[2], path) ?? 0,
      this.token(pad[3], path) ?? 0,
    ];
  }

  private same(n: number): readonly [number, number, number, number] {
    return [n, n, n, n];
  }

  /** Mode de dimension d'un nœud sur un axe, défaut `hug`, imposition du parent comprise. */
  private mode(node: Node, axis: Axis, forced?: Forced): Size {
    if (forced?.axis === axis) return { kind: forced.mode };
    if (node.type === "Icon") return { kind: "fixed", value: node.props.size };
    return node.props[axis] ?? { kind: "hug" };
  }

  private bound(
    node: Node,
    axis: Axis,
    which: "min" | "max",
    path: string,
  ): number | undefined {
    if (node.type === "Icon") return undefined;
    const value =
      axis === "w"
        ? which === "min"
          ? node.props.minW
          : node.props.maxW
        : which === "min"
          ? node.props.minH
          : node.props.maxH;
    return value === undefined ? undefined : this.length(value, path);
  }

  /** `available(nœud, axe, max)` : l'espace proposé borné par le nœud lui-même. */
  private available(node: Node, axis: Axis, max: number, path: string): number {
    const bound = this.bound(node, axis, "max", path);
    return bound === undefined ? max : Math.min(max, bound);
  }

  /** Taille extérieure : bornée par min/max, puis par le padding, incompressible. */
  private outer(
    node: Node,
    axis: Axis,
    value: number,
    padding: number,
    path: string,
  ): number {
    return Math.max(this.clamp(node, axis, value, path), padding);
  }

  private clamp(node: Node, axis: Axis, value: number, path: string): number {
    const min = this.bound(node, axis, "min", path);
    const max = this.bound(node, axis, "max", path);
    let out = value;
    if (max !== undefined) out = Math.min(out, max);
    if (min !== undefined) out = Math.max(out, min);
    return out;
  }

  private fillSize(max: number, axis: Axis, path: string): number {
    if (Number.isFinite(max)) return max;
    this.report(
      "E007",
      path,
      `${axis}: fill sous une contrainte infinie. Donner fixed ou hug, ou borner le parent (ADR-008).`,
    );
    return 0;
  }

  // -- measure ----------------------------------------------------------------

  measure(
    node: Node,
    maxW: number,
    maxH: number,
    indices: readonly number[],
    parentPath: string,
    forced?: Forced,
  ): Measured {
    const index = indices[indices.length - 1] ?? 0;
    const segment = node.id ?? `${node.type}[${String(index)}]`;
    const path = parentPath === "" ? segment : `${parentPath}/${segment}`;
    const key = node.id ?? `/${indices.join("/")}`;
    if (node.type === "Stack")
      return this.measureStack(node, maxW, maxH, key, path, indices, forced);
    return this.measureLeaf(node, maxW, maxH, key, path, forced);
  }

  private measureLeaf(
    node: Node,
    maxW: number,
    maxH: number,
    key: string,
    path: string,
    forced?: Forced,
  ): Measured {
    const max = { w: maxW, h: maxH };
    const leaf = (w: number, h: number): Measured => ({
      node,
      key,
      w,
      h,
      children: [],
    });

    if (node.type === "Icon") {
      const size = this.token(node.props.size, path) ?? 0;
      return leaf(size, size);
    }

    const resolve = (axis: Axis, intrinsic: number): number => {
      const m = this.mode(node, axis, forced);
      if (m.kind === "fixed") return this.length(m.value, path);
      if (m.kind === "fill") return this.fillSize(max[axis], axis, path);
      return intrinsic;
    };

    if (node.type === "Text") {
      const content = node.content;
      const text =
        content.kind === "literal"
          ? content.value
          : (this.options.slots?.[content.name] ?? "");
      const style = this.typography(node.props.style, path);
      // Largeurs intrinsèques, indépendantes de maxLines : le mot le plus
      // long (minimum de contenu) et le texte sans repli (maximum).
      const intrinsic = (width: number): number =>
        this.options.platform.measureText(text, style, width, undefined).w;
      // `hug` est la largeur sans repli, bornée par l'espace offert, mais
      // jamais sous le mot le plus long : un texte ne se replie pas à
      // l'intérieur d'un mot (§5.2). Le texte se replie ensuite dans la
      // largeur utilisée, bornes min/max comprises, et elle donne la hauteur.
      const wMode = this.mode(node, "w", forced);
      const width = this.clamp(
        node,
        "w",
        wMode.kind === "fixed"
          ? this.length(wMode.value, path)
          : wMode.kind === "fill"
            ? this.fillSize(maxW, "w", path)
            : Math.max(
                intrinsic(0),
                Math.min(
                  intrinsic(Number.POSITIVE_INFINITY),
                  this.available(node, "w", maxW, path),
                ),
              ),
        path,
      );
      const size = this.options.platform.measureText(
        text,
        style,
        width,
        node.props.maxLines,
      );
      return leaf(width, this.clamp(node, "h", resolve("h", size.h), path));
    }

    // Box ou Image : intrinsèque (0, 0). Le ratio dérive l'autre axe de la
    // taille utilisée, bornes comprises, et l'axe dérivé est borné à son tour.
    const resolved = (axis: Axis): boolean =>
      this.mode(node, axis, forced).kind !== "hug";
    let w = this.clamp(node, "w", resolve("w", 0), path);
    let h = this.clamp(node, "h", resolve("h", 0), path);
    if (
      node.type === "Image" &&
      node.props.ratio !== undefined &&
      resolved("w") !== resolved("h")
    ) {
      const [rw, rh] = node.props.ratio;
      if (resolved("w")) h = this.clamp(node, "h", (w * rh) / rw, path);
      else w = this.clamp(node, "w", (h * rw) / rh, path);
    }
    return leaf(w, h);
  }

  private measureStack(
    node: StackNode,
    maxW: number,
    maxH: number,
    key: string,
    path: string,
    indices: readonly number[],
    forced?: Forced,
  ): Measured {
    const p = node.props;
    const main: Axis = p.dir === "h" ? "w" : "h";
    const cross = other(main);
    // L'espace que le parent propose. Sur un axe hug, les min/max du Stack ne
    // bornent que sa propre taille, pas ce qu'il propose à ses enfants : sous
    // un max plus petit, le contenu déborde (§5.2, comme en CSS).
    const max = { w: maxW, h: maxH };
    const [pt, pr, pb, pl] = this.pad(p.pad, path);
    const padding = { w: pl + pr, h: pt + pb };
    // Sur un axe où le Stack est fixed ou fill, sa taille ne dépend pas des
    // enfants : elle est connue d'abord, et c'est elle qui les contraint (§5.2).
    const own = (axis: Axis): number | undefined => {
      const m = this.mode(node, axis, forced);
      if (m.kind === "hug") return undefined;
      const value =
        m.kind === "fixed"
          ? this.length(m.value, path)
          : this.fillSize(max[axis], axis, path);
      return this.outer(node, axis, value, padding[axis], path);
    };
    const outerSize = { w: own("w"), h: own("h") };
    const innerMax = {
      w: Math.max(0, (outerSize.w ?? max.w) - padding.w),
      h: Math.max(0, (outerSize.h ?? max.h) - padding.h),
    };
    if (p.overflow === "scroll") innerMax[main] = Number.POSITIVE_INFINITY;
    const gap = p.gap === undefined ? 0 : (this.token(p.gap, path) ?? 0);
    const n = node.children.length;
    const gaps = gap * Math.max(0, n - 1);
    const disponibleMain = innerMax[main] - gaps;

    const mainOf = (m: Measured): number => (main === "w" ? m.w : m.h);
    const crossOf = (m: Measured): number => (main === "w" ? m.h : m.w);
    const measureChild = (
      i: number,
      mainConstraint: number,
      crossConstraint: number,
      childForced?: Forced,
    ): Measured => {
      const child = node.children[i];
      if (child === undefined) throw new RangeError("enfant absent");
      const [w, h] =
        main === "w"
          ? [mainConstraint, crossConstraint]
          : [crossConstraint, mainConstraint];
      return this.measure(child, w, h, [...indices, i], path, childForced);
    };
    /** Étapes 1 à 3 : un enfant fill sur cross est mesuré comme hug sur cross. */
    const provisional = (child: Node): Forced | undefined =>
      this.mode(child, cross).kind === "fill"
        ? { axis: cross, mode: "hug" }
        : undefined;

    const measured: Measured[] = [];
    const mainConstraint: number[] = [];
    let sFixed = 0;
    let sHug = 0;
    const fills: number[] = [];
    node.children.forEach((child, i) => {
      const m = this.mode(child, main);
      if (m.kind === "fill") {
        fills.push(i);
        return;
      }
      const childPath = `${path}/${child.id ?? `${child.type}[${String(i)}]`}`;
      const constraint =
        m.kind === "fixed"
          ? this.length(m.value, childPath)
          : Number.POSITIVE_INFINITY;
      mainConstraint[i] = constraint;
      const measuredChild = measureChild(
        i,
        constraint,
        innerMax[cross],
        provisional(child),
      );
      measured[i] = measuredChild;
      if (m.kind === "fixed") sFixed += mainOf(measuredChild);
      else sHug += mainOf(measuredChild);
    });

    if (fills.length > 0) {
      let reste = Math.max(0, disponibleMain - sFixed - sHug);
      // Une contrainte infinie n'est définitive que si elle vient de scroll (ADR-008).
      // Sinon elle est transitoire : mesure provisoire d'un ancêtre étiré, remesuré à
      // l'étape 6 avec une contrainte finie ; le fill vaut 0 en attendant, comme flexbox.
      if (!Number.isFinite(reste) && p.overflow !== "scroll") reste = 0;
      if (!Number.isFinite(reste)) {
        for (const i of fills) {
          const child = node.children[i];
          const childPath = `${path}/${child?.id ?? `${child?.type ?? "?"}[${String(i)}]`}`;
          this.report(
            "E007",
            childPath,
            `${main}: fill sur l'axe de défilement de son parent scroll (ADR-008) : mettre fixed ou hug, ou retirer scroll du parent.`,
          );
        }
        reste = 0;
      }
      // Sur un axe main hug, il n'y a pas d'espace libre à répartir : un
      // enfant fill vaut sa base, zéro (§5.2, comme `flex-basis: 0`). Le cas
      // n'existe que sous l'exception de la règle 1 de §6, parent étiré.
      if (outerSize[main] === undefined) reste = 0;
      // Base d'un enfant fill : le padding qu'il porte sur l'axe principal,
      // incompressible et hors de l'espace à répartir (§5.2, `flex-basis: 0`).
      const base = new Map<number, number>();
      for (const i of fills) {
        const child = node.children[i];
        if (child?.type !== "Stack") {
          base.set(i, 0);
          continue;
        }
        const [ct, cr, cb, cl] = this.pad(
          child.props.pad,
          `${path}/${child.id ?? `Stack[${String(i)}]`}`,
        );
        base.set(i, main === "w" ? cl + cr : ct + cb);
      }
      let bases = 0;
      for (const v of base.values()) bases += v;
      reste = Math.max(0, reste - bases);

      // Résolution des tailles flexibles, comme flexbox : à chaque tour, on ne
      // gèle que les enfants dont la violation va dans le sens de la violation
      // totale, et les autres se repartagent ce qui reste (§5.2, étape 3).
      const frozen = new Map<number, number>();
      for (let round = 0; round <= fills.length; round++) {
        const open = fills.filter((i) => !frozen.has(i));
        if (open.length === 0) break;
        let grown = 0;
        for (const [i, v] of frozen) grown += v - (base.get(i) ?? 0);
        const part = Math.max(0, reste - grown) / open.length;
        const violations = new Map<number, number>();
        let total = 0;
        for (const i of open) {
          const child = node.children[i];
          if (child === undefined) continue;
          const constraint = (base.get(i) ?? 0) + part;
          mainConstraint[i] = constraint;
          const measuredChild = measureChild(
            i,
            constraint,
            innerMax[cross],
            provisional(child),
          );
          measured[i] = measuredChild;
          const violation = mainOf(measuredChild) - constraint;
          violations.set(i, violation);
          total += violation;
        }
        if ([...violations.values()].every((v) => Math.abs(v) <= EPSILON))
          break;
        for (const [i, violation] of violations) {
          const matches =
            Math.abs(total) <= EPSILON ||
            (total > 0 ? violation > EPSILON : violation < -EPSILON);
          if (matches)
            frozen.set(
              i,
              mainOf(measured[i] ?? { node, key, w: 0, h: 0, children: [] }),
            );
        }
      }
    }

    const crossContent = measured.reduce(
      (acc, m) => Math.max(acc, crossOf(m)),
      0,
    );
    const crossSize =
      outerSize[cross] ??
      this.outer(
        node,
        cross,
        crossContent + padding[cross],
        padding[cross],
        path,
      );
    // Contrainte cross définitive : la taille utilisée du Stack, bornes
    // comprises. Un enfant qui se dimensionne seul n'y descend pas sous son
    // minimum de contenu et déborde alors, comme en CSS (§5.2).
    const usedCross = Math.max(0, crossSize - padding[cross]);

    // Étape 6 : les enfants sont remesurés avec cette contrainte — en fill
    // s'ils sont fill ou étirés par crossAlign: stretch, dans leur propre mode
    // sinon.
    node.children.forEach((child, i) => {
      if (child.type === "Icon") return;
      const cm = this.mode(child, cross);
      const stretch =
        cm.kind === "hug" && (p.crossAlign ?? "start") === "stretch";
      const forcedCross: Forced | undefined =
        cm.kind === "fill" || stretch
          ? { axis: cross, mode: "fill" }
          : undefined;
      if (
        forcedCross === undefined &&
        Math.abs(usedCross - innerMax[cross]) <= EPSILON
      )
        return;
      measured[i] = measureChild(
        i,
        mainConstraint[i] ?? Number.POSITIVE_INFINITY,
        usedCross,
        forcedCross,
      );
    });

    // La taille main vient des tailles obtenues après la remesure : sur cross,
    // un enfant plus large a moins de lignes, donc une taille main plus petite.
    const content = measured.reduce((acc, m) => acc + mainOf(m), 0) + gaps;
    const mainSize =
      outerSize[main] ??
      this.outer(node, main, content + padding[main], padding[main], path);

    const [w, h] = main === "w" ? [mainSize, crossSize] : [crossSize, mainSize];
    return { node, key, w, h, children: measured };
  }

  /** Mode d'un axe de la racine, pour la contrainte que `layout` lui donne. */
  rootMode(node: Node, axis: Axis): Size["kind"] {
    return this.mode(node, axis).kind;
  }

  // -- arrange ----------------------------------------------------------------

  arrange(m: Measured, x: number, y: number, out: Map<string, Rect>): void {
    out.set(m.key, { x, y, w: m.w, h: m.h });
    if (m.node.type !== "Stack") return;
    const p = m.node.props;
    const main: Axis = p.dir === "h" ? "w" : "h";
    const [pt, pr, pb, pl] = this.pad(p.pad, m.key);
    const padStart = { w: pl, h: pt };
    const padding = { w: pl + pr, h: pt + pb };
    const gap = p.gap === undefined ? 0 : (this.token(p.gap, m.key) ?? 0);
    const n = m.children.length;
    const size = { w: m.w, h: m.h };
    const cross = other(main);
    const innerMain = Math.max(0, size[main] - padding[main]);
    const innerCross = Math.max(0, size[cross] - padding[cross]);
    const mainOf = (c: Measured): number => (main === "w" ? c.w : c.h);
    const crossOf = (c: Measured): number => (main === "w" ? c.h : c.w);
    const contentMain =
      m.children.reduce((acc, c) => acc + mainOf(c), 0) +
      gap * Math.max(0, n - 1);
    const free = innerMain - contentMain;

    let cursor = padStart[main];
    let extraGap = 0;
    switch (p.mainAlign ?? "start") {
      case "center":
        cursor += free / 2;
        break;
      case "end":
        cursor += free;
        break;
      case "between":
        if (n > 1 && free > 0) extraGap = free / (n - 1);
        break;
      case "start":
        break;
    }

    for (const child of m.children) {
      let crossPos = padStart[cross];
      // Un enfant fill sur cross a déjà reçu l'espace : il commence au
      // padding, même si un min/max l'a ramené à une taille plus petite.
      const filled =
        child.node.type !== "Icon" &&
        this.mode(child.node, cross).kind === "fill";
      switch (filled ? "start" : (p.crossAlign ?? "start")) {
        case "center":
          crossPos += (innerCross - crossOf(child)) / 2;
          break;
        case "end":
          crossPos += innerCross - crossOf(child);
          break;
        case "start":
        case "stretch":
          break;
      }
      const cx = main === "w" ? x + cursor : x + crossPos;
      const cy = main === "w" ? y + crossPos : y + cursor;
      this.arrange(child, cx, cy, out);
      cursor += mainOf(child) + gap + extraGap;
    }
  }
}
