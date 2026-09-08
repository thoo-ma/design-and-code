/**
 * Compilateur IR → SwiftUI (T11, spec §9.2, §11.2, §10.3).
 *
 * Produit la zone générée `XLayout.gen.swift` (`struct XLayout: View`, un
 * `let` par slot, `.irNode("id")` sur chaque nœud, `#Preview` avec les
 * placeholders) et la première version de la zone préservée `XView.swift`.
 * Pur : l'appelant écrit les fichiers. Le compilateur normalise son entrée
 * (§7, loi 4).
 *
 * Le sous-ensemble SwiftUI émis est celui de §11.2. Une propriété surchargée
 * par `@expanded` devient une expression `sizeClass == .compact ? a : b` dans
 * son modificateur, sauf `dir` qui passe par `AnyLayout`.
 */

import {
  BASE_BREAKPOINT,
  RESERVED_SLOT_NAMES,
  fail,
  irError,
  normalize,
  ok,
  resolveBreakpoint,
} from "ir-core";
import type {
  Border,
  DesignSystem,
  IRError,
  Length,
  Node,
  Result,
  Screen,
  Size,
  StackNode,
  Token,
} from "ir-core";

import { camel, swiftIdentifier } from "./tokens.js";

export interface SwiftCompileOptions {
  readonly designSystem: DesignSystem;
  /** Valeurs d'exemple des slots pour le `#Preview` et la zone préservée initiale ; défaut : le nom du slot. */
  readonly samples?: Readonly<Record<string, string>>;
}

export interface SwiftFiles {
  readonly gen: string;
  readonly preserved: string;
}

export interface SwiftOutput {
  readonly files: SwiftFiles;
  readonly gen: string;
  readonly preserved: string;
  readonly warnings: readonly IRError[];
}

interface Slot {
  readonly name: string;
  readonly type: "String" | "ImageSource";
}

const HUG: Size = { kind: "hug" };
const INDENT = "  ";

/** `my-screen` → `MyScreenLayout`. */
export function layoutName(screenName: string): string {
  return (
    screenName
      .split(/[-_]/)
      .filter((p) => p.length > 0)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + "Layout"
  );
}

export function viewName(screenName: string): string {
  return layoutName(screenName).replace(/Layout$/, "View");
}

export function swiftFileNames(screenName: string): SwiftFiles {
  return {
    gen: `${layoutName(screenName)}.gen.swift`,
    preserved: `${viewName(screenName)}.swift`,
  };
}

/** Chaîne Swift : littéral JSON (échappements identiques). */
export function swiftString(value: string): string {
  return JSON.stringify(value);
}

/** Taille par axe ; une Icon vaut `fixed(size)` (§4.6), jamais lue ici. */
function sizeOf(node: Node, axis: "w" | "h"): Size {
  if (node.type === "Icon") return { kind: "fixed", value: node.props.size };
  return node.props[axis] ?? HUG;
}

type Props = Readonly<Record<string, unknown>>;

export function compileSwift(
  screen: Screen,
  options: SwiftCompileOptions,
): Result<SwiftOutput> {
  const normalized = normalize(screen);
  return new Compiler(normalized.screen, options).run(normalized.warnings);
}

class Compiler {
  readonly errors: IRError[] = [];
  private readonly slots: Slot[] = [];
  private usesSizeClass = false;
  private readonly ds: DesignSystem;
  private readonly breakpoints: readonly string[];

  constructor(
    private readonly screen: Screen,
    private readonly options: SwiftCompileOptions,
  ) {
    this.ds = options.designSystem;
    this.breakpoints = [...this.ds.breakpoints.keys()].filter(
      (n) => n !== BASE_BREAKPOINT,
    );
  }

  run(warnings: readonly IRError[]): Result<SwiftOutput> {
    if (this.breakpoints.length > 1)
      this.report(
        "E010",
        "",
        `Plus d'un breakpoint non-base (${this.breakpoints.join(", ")}) : le backend SwiftUI v0 n'en représente que deux via la size class (spec §11.2).`,
      );
    const base = resolveBreakpoint(this.screen, BASE_BREAKPOINT);
    const expanded =
      this.breakpoints.length === 0
        ? base
        : resolveBreakpoint(
            this.screen,
            this.breakpoints[0] ?? BASE_BREAKPOINT,
          );
    const body = this.node(
      base.root,
      expanded.root,
      undefined,
      undefined,
      2,
      "",
    );
    const gen = this.genFile(body);
    if (this.errors.length > 0) return fail(this.errors);
    return ok({
      files: swiftFileNames(this.screen.name),
      gen,
      preserved: this.preservedFile(),
      warnings,
    });
  }

  private report(
    code: "E002" | "E004" | "E010",
    path: string,
    message: string,
  ): void {
    this.errors.push(irError(code, path, `${message} (compilateur SwiftUI)`));
  }

  // -- valeurs ----------------------------------------------------------------

  private length(value: Length): string {
    return typeof value === "number" ? String(value) : this.token(value);
  }

  /** Token de l'IR → expression Swift `T.groupe.sous.nom`. */
  private token(token: Token): string {
    if (token.group === "icon")
      return `T.icon.${swiftIdentifier(camel([token.path[0] ?? ""]))}`;
    return `T.${token.group}.${token.path.map(swiftIdentifier).join(".")}`;
  }

  /** Valeur Scalaire surchargée → expression Swift, `undefined` si absente partout. */
  private cond<V>(
    base: V | undefined,
    expanded: V | undefined,
    fmt: (v: V) => string,
    absent: string,
  ): string | undefined {
    if (base === undefined && expanded === undefined) return undefined;
    const b = base === undefined ? absent : fmt(base);
    const e = expanded === undefined ? absent : fmt(expanded);
    if (b === e) return b;
    this.usesSizeClass = true;
    return `sizeClass == .compact ? ${b} : ${e}`;
  }

  // -- nœud -------------------------------------------------------------------

  private node(
    b: Node,
    e: Node,
    bParent: StackNode | undefined,
    eParent: StackNode | undefined,
    depth: number,
    parentPath: string,
  ): string[] {
    const id = b.id ?? "";
    const path = parentPath === "" ? id : `${parentPath}/${id}`;
    const p = pad(depth);
    const pm = pad(depth + 1);

    if (b.type === "Stack") {
      const eb = e as StackNode;
      const lines = this.stackContainer(b, eb, depth, path);
      this.stackModifiers(b, eb, p, path, lines);
      return lines;
    }

    const out: string[] = [`${p}${this.leafExpression(b, e, path)}`];
    const push = (line: string): void => {
      out.push(line);
    };
    if (b.type === "Box") {
      this.boxStyle(b, e, pm, push);
      for (const m of this.frameLines(b, e, pm)) push(m);
      this.overlay(b, e, pm, push);
      this.opacityShadow(b, e, pm, push);
      this.accessibility(b, pm, push);
      push(`${pm}.irNode(${swiftString(id)})`);
    } else if (b.type === "Text") {
      this.text(b, e, pm, push);
      for (const m of this.frameLines(b, e, pm)) push(m);
      this.accessibility(b, pm, push);
      push(`${pm}.irNode(${swiftString(id)})`);
    } else if (b.type === "Image") {
      this.image(b, e, pm, push);
      for (const m of this.frameLines(b, e, pm)) push(m);
      this.accessibility(b, pm, push);
      push(`${pm}.irNode(${swiftString(id)})`);
    } else {
      // Icon : pas de frames ni de style (§4.6), mais size et color restent
      // surchargeables (§4.7) ; `name` est le contenu, jamais surchargé.
      const eb = e as Extract<Node, { type: "Icon" }>;
      const iconName = b.props.name.path[0] ?? "";
      if (this.ds.icons.get(iconName)?.["ios"] === undefined)
        this.report(
          "E002",
          path,
          `L'icône $icon.${iconName} n'a pas de nom pour le backend ios (ADR-005)`,
        );
      const name = this.token(b.props.name);
      const size = this.cond(
        b.props.size,
        eb.props.size,
        (t) => this.token(t),
        "T.size.icon.md",
      );
      const color = this.cond(
        b.props.color,
        eb.props.color,
        (t) => this.token(t),
        "T.color.text.primary",
      );
      out[0] = `${p}Image(systemName: ${name}).font(.system(size: ${size ?? "T.size.icon.md"}))`;
      if (color !== undefined) push(`${pm}.foregroundStyle(${color})`);
      this.accessibility(b, pm, push);
      push(`${pm}.irNode(${swiftString(id)})`);
    }
    return out;
  }

  private leafExpression(b: Node, e: Node, path: string): string {
    switch (b.type) {
      case "Stack":
        return ""; // jamais atteint : un Stack passe par stackContainer
      case "Box": {
        const r = this.radiusExpr(b, e);
        return r === "0"
          ? "Rectangle()"
          : `RoundedRectangle(cornerRadius: ${r})`;
      }
      case "Text":
        return b.content.kind === "slot"
          ? `Text(${this.slotParam(b.content.name, "String", path)})`
          : `Text(${swiftString(b.content.value)})`;
      case "Image":
        return b.content.kind === "slot"
          ? `Image(source: ${this.slotParam(b.content.name, "ImageSource", path)})`
          : `Image(${swiftString(b.content.value)})`;
      case "Icon":
        return `Image(systemName: ${this.token(b.props.name)}).font(.system(size: ${this.token(b.props.size)}))`;
    }
  }

  private slotParam(name: string, type: Slot["type"], path: string): string {
    const seen = this.slots.find((s) => s.name === name);
    if (seen === undefined) {
      if (RESERVED_SLOT_NAMES.has(name))
        this.report(
          "E004",
          path,
          `slot(${name}) : nom réservé par la cible SwiftUI, ou déjà utilisé par le fichier généré (§9.3). Le renommer.`,
        );
      this.slots.push({ name, type });
      return name;
    }
    if (seen.type !== type)
      this.report("E004", path, `slot(${name}) utilisé avec deux types (§9.3)`);
    return name;
  }

  // -- Stack ------------------------------------------------------------------

  private stackContainer(
    b: StackNode,
    e: StackNode,
    depth: number,
    path: string,
  ): string[] {
    const p = pad(depth);
    const scroll = (b.props.overflow ?? "visible") === "scroll";
    const childDepth = scroll ? depth + 2 : depth + 1;
    const pm = pad(childDepth);

    const dirV = (n: StackNode): boolean => (n.props.dir ?? "v") === "v";
    const cross = (n: StackNode): string => n.props.crossAlign ?? "start";
    const alignMap =
      (dirIsV: boolean) =>
      (c: string): string => {
        if (dirIsV)
          return c === "center"
            ? ".center"
            : c === "end"
              ? ".trailing"
              : ".leading";
        return c === "center" ? ".center" : c === "end" ? ".bottom" : ".top";
      };
    const cb = cross(b);
    const ce = cross(e);
    let alignment: string | undefined;
    if (cb === "stretch" && ce === "stretch") alignment = undefined;
    else if (cb === ce) alignment = alignMap(dirV(b))(cb);
    else {
      this.usesSizeClass = true;
      alignment = `sizeClass == .compact ? ${alignMap(dirV(b))(cb)} : ${alignMap(dirV(e))(ce)}`;
    }
    const spacing = this.cond(
      b.props.gap,
      e.props.gap,
      (g) => this.token(g),
      "T.space.none",
    );

    // Enfants (avec Spacers de mainAlign et étirement crossAlign).
    const body: string[] = [];
    const spacerLine = `${pm}Spacer(minLength: 0)`;
    const sp = this.spacers(b);
    if (sp === "start" || sp === "center") body.push(spacerLine);
    b.children.forEach((child, k) => {
      const eChild = (e.children[k] ?? child) as Node;
      const childLines = this.node(child, eChild, b, e, childDepth, path);
      const stretch = this.stretchFrame(child, eChild, b, e);
      if (stretch !== undefined) {
        const last = childLines[childLines.length - 1] ?? "";
        const ind = last.length - last.trimStart().length;
        childLines.splice(
          childLines.length - 1,
          0,
          `${" ".repeat(ind)}${stretch}`,
        );
      }
      body.push(...childLines);
      if (sp === "between" && k < b.children.length - 1) body.push(spacerLine);
    });
    if (sp === "end" || sp === "center") body.push(spacerLine);

    const lines: string[] = [];
    if (scroll) {
      const axis = dirV(b) ? "vertical" : "horizontal";
      lines.push(`${p}ScrollView(.${axis}) {`);
      lines.push(this.stackOpen(b, e, alignment, spacing, depth + 1));
      lines.push(...body);
      lines.push(`${pad(depth + 1)}}`);
      lines.push(`${p}}`);
      return lines;
    }
    lines.push(this.stackOpen(b, e, alignment, spacing, depth));
    lines.push(...body);
    lines.push(`${p}}`);
    return lines;
  }

  /** Ligne d'ouverture du conteneur (VStack/HStack/AnyLayout). */
  private stackOpen(
    b: StackNode,
    e: StackNode,
    alignment: string | undefined,
    spacing: string | undefined,
    depth: number,
  ): string {
    const p = pad(depth);
    const dirChanged = (b.props.dir ?? "v") !== (e.props.dir ?? "v");
    if (dirChanged) {
      this.usesSizeClass = true;
      // Chaque branche est construite depuis son propre nœud : l'alignement
      // dépend de la direction (`.leading` vs `.top`), et gap/crossAlign
      // peuvent eux-mêmes être surchargés.
      const branch = (node: StackNode, dirIsV: boolean): string => {
        const args: string[] = [];
        const cross = node.props.crossAlign ?? "start";
        if (cross !== "stretch") {
          const a =
            cross === "center"
              ? ".center"
              : cross === "end"
                ? dirIsV
                  ? ".trailing"
                  : ".bottom"
                : dirIsV
                  ? ".leading"
                  : ".top";
          args.push(`alignment: ${a}`);
        }
        const gap = node.props.gap;
        if (gap !== undefined) args.push(`spacing: ${this.token(gap)}`);
        const joined = args.length > 0 ? `(${args.join(", ")})` : "";
        return `AnyLayout(${dirIsV ? "VStackLayout" : "HStackLayout"}${joined})`;
      };
      const cb = (b.props.dir ?? "v") === "v";
      const ce = (e.props.dir ?? "v") === "v";
      return `${p}AnyLayout(sizeClass == .compact ? ${branch(b, cb)} : ${branch(e, ce)}) {`;
    }
    const args: string[] = [];
    if (alignment !== undefined) args.push(`alignment: ${alignment}`);
    if (spacing !== undefined) args.push(`spacing: ${spacing}`);
    const joined = args.length > 0 ? `(${args.join(", ")})` : "";
    const tag = (b.props.dir ?? "v") === "v" ? "VStack" : "HStack";
    return `${p}${tag}${joined} {`;
  }

  /** Position des Spacers de `mainAlign`, uniquement pour un Stack `fill` sur son axe principal. */
  private spacers(
    b: StackNode,
  ): "none" | "start" | "end" | "center" | "between" {
    const mainAxis: "w" | "h" = (b.props.dir ?? "v") === "v" ? "h" : "w";
    if (sizeOf(b, mainAxis).kind !== "fill") return "none";
    const a = b.props.mainAlign ?? "start";
    if (a === "between" && b.children.length >= 2) return "between";
    if (a === "center") return "center";
    if (a === "end") return "start"; // Spacer en tête
    return "end"; // start (et between à < 2 enfants) : Spacer en queue
  }

  /** `.frame(maxWidth/maxHeight: .infinity)` d'étirement crossAlign stretch sur un enfant `hug`. */
  private stretchFrame(
    child: Node,
    eChild: Node,
    bParent: StackNode,
    eParent: StackNode,
  ): string | undefined {
    if (child.type === "Icon") return undefined;
    const crossAxis: "w" | "h" = (bParent.props.dir ?? "v") === "v" ? "w" : "h";
    const arg = crossAxis === "w" ? "maxWidth" : "maxHeight";
    const stretchAt = (parent: StackNode): boolean =>
      (parent.props.crossAlign ?? "start") === "stretch";
    const hugAt = (n: Node): boolean => sizeOf(n, crossAxis).kind === "hug";
    const bs = stretchAt(bParent) && hugAt(child);
    const es = stretchAt(eParent) && hugAt(eChild);
    if (!bs && !es) return undefined;
    if (bs && es) return `.frame(${arg}: .infinity)`;
    this.usesSizeClass = true;
    return `.frame(${arg}: sizeClass == .compact ? ${bs ? ".infinity" : "nil"} : ${es ? ".infinity" : "nil"})`;
  }

  private stackModifiers(
    b: StackNode,
    e: StackNode,
    p: string,
    path: string,
    lines: string[],
  ): void {
    const push = (line: string): void => {
      lines.push(line);
    };
    const padExpr = this.cond(
      b.props.pad,
      e.props.pad,
      (v) => this.padExpr(v),
      "T.space.none",
    );
    if (padExpr !== undefined) push(`${p}.padding(${padExpr})`);
    for (const m of this.frameLines(b, e, p)) push(m);
    this.stackStyle(b, e, p, push);
    this.overlay(b, e, p, push);
    if ((b.props.overflow ?? "visible") === "clip") push(`${p}.clipped()`);
    this.opacityShadow(b, e, p, push);
    this.accessibility(b, p, push);
    push(`${p}.irNode(${swiftString(b.id ?? "")})`);
  }

  /** `.padding(...)` d'un pad : token, ($v,$h) ou ($t,$r,$b,$l). */
  private padExpr(v: unknown): string {
    if (!Array.isArray(v)) return this.token(v as Token);
    const arr = v as readonly Token[];
    return arr.map((t) => this.token(t)).join(", ");
  }

  // -- style ------------------------------------------------------------------

  private radiusExpr(b: Node, e: Node): string {
    const bp = b.props as Props;
    const ep = e.props as Props;
    return (
      this.cond(
        bp["radius"] as Token | undefined,
        ep["radius"] as Token | undefined,
        (t) => this.token(t),
        "0",
      ) ?? "0"
    );
  }

  /** Box : `.fill(bg)` sur la forme de base. */
  private boxStyle(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    const bp = b.props as Props;
    const ep = e.props as Props;
    const bg = this.cond(
      bp["bg"] as Token | undefined,
      ep["bg"] as Token | undefined,
      (t) => this.token(t),
      "Color.clear",
    );
    if (bg !== undefined && bg !== "Color.clear") push(`${p}.fill(${bg})`);
  }

  /** Stack : `.background` (avec shape si radius) ou `.clipShape`. */
  private stackStyle(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    const bp = b.props as Props;
    const ep = e.props as Props;
    const bg = this.cond(
      bp["bg"] as Token | undefined,
      ep["bg"] as Token | undefined,
      (t) => this.token(t),
      "Color.clear",
    );
    const radius = this.radiusExpr(b, e);
    const hasBg = bg !== undefined && bg !== "Color.clear";
    const hasRadius = radius !== "0";
    const bgTernary = bg !== undefined && bg.includes("sizeClass");
    if (hasBg && hasRadius && !bgTernary)
      push(
        `${p}.background(${bg}, in: RoundedRectangle(cornerRadius: ${radius}))`,
      );
    else {
      if (hasBg) push(`${p}.background(${bg})`);
      if (hasRadius)
        push(`${p}.clipShape(RoundedRectangle(cornerRadius: ${radius}))`);
    }
  }

  /** `.overlay(shape.stroke(color, lineWidth: size))` de la bordure. */
  private overlay(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    const bp = b.props as Props;
    const ep = e.props as Props;
    const bBorder = bp["border"] as Border | undefined;
    const eBorder = ep["border"] as Border | undefined;
    if (bBorder === undefined && eBorder === undefined) return;
    const radius = this.radiusExpr(b, e);
    const shape = `RoundedRectangle(cornerRadius: ${radius})`;
    const stroke = (border: Border): string =>
      `.stroke(${this.token(border[1])}, lineWidth: ${this.token(border[0])})`;
    if (bBorder !== undefined && eBorder !== undefined) {
      const sb = this.token(bBorder[1]);
      const wb = this.token(bBorder[0]);
      const se = this.token(eBorder[1]);
      const we = this.token(eBorder[0]);
      if (sb === se && wb === we)
        push(`${p}.overlay(${shape}${stroke(bBorder)})`);
      else {
        this.usesSizeClass = true;
        push(
          `${p}.overlay(${shape}.stroke(sizeClass == .compact ? ${sb} : ${se}, lineWidth: sizeClass == .compact ? ${wb} : ${we}))`,
        );
      }
      return;
    }
    // Surcharge qui ajoute ou retire la bordure.
    this.usesSizeClass = true;
    const sb = bBorder === undefined ? "Color.clear" : this.token(bBorder[1]);
    const wb = bBorder === undefined ? "0" : this.token(bBorder[0]);
    const se = eBorder === undefined ? "Color.clear" : this.token(eBorder[1]);
    const we = eBorder === undefined ? "0" : this.token(eBorder[0]);
    push(
      `${p}.overlay(${shape}.stroke(sizeClass == .compact ? ${sb} : ${se}, lineWidth: sizeClass == .compact ? ${wb} : ${we}))`,
    );
  }

  /** `.opacity` et `.shadow` communs à Stack et Box. */
  private opacityShadow(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    const bp = b.props as Props;
    const ep = e.props as Props;
    const opacity = this.cond(
      bp["opacity"] as Token | undefined,
      ep["opacity"] as Token | undefined,
      (t) => this.token(t),
      "1",
    );
    if (opacity !== undefined && opacity !== "1")
      push(`${p}.opacity(${opacity})`);
    const shadow = this.cond(
      bp["shadow"] as Token | undefined,
      ep["shadow"] as Token | undefined,
      (t) => this.token(t),
      "nil",
    );
    if (shadow !== undefined && shadow !== "nil")
      push(`${p}.shadow(${shadow})`);
  }

  // -- frames ----------------------------------------------------------------

  private frameLines(b: Node, e: Node, p: string): string[] {
    if (b.type === "Icon") return [];
    const out: string[] = [];
    // Un seul `.frame` quand w et h partagent le même mode, non surchargé
    // (la sortie de §10.3) ; sinon un `.frame` par axe.
    const bw = sizeOf(b, "w");
    const ew = sizeOf(e, "w");
    const bh = sizeOf(b, "h");
    const eh = sizeOf(e, "h");
    if (
      sameSize(bw, ew) &&
      sameSize(bh, eh) &&
      bw.kind === bh.kind &&
      bw.kind === "fill"
    ) {
      out.push(`${p}.frame(maxWidth: .infinity, maxHeight: .infinity)`);
    } else if (
      sameSize(bw, ew) &&
      sameSize(bh, eh) &&
      bw.kind === bh.kind &&
      bw.kind === "fixed" &&
      bh.kind === "fixed"
    ) {
      out.push(
        `${p}.frame(width: ${this.length(bw.value)}, height: ${this.length(bh.value)})`,
      );
    } else {
      out.push(...this.sizeFrame("w", b, e, p));
      out.push(...this.sizeFrame("h", b, e, p));
    }
    const bp = b.props as Props;
    const ep = e.props as Props;
    const constraints = [
      ["minW", "minWidth"],
      ["maxW", "maxWidth"],
      ["minH", "minHeight"],
      ["maxH", "maxHeight"],
    ] as const;
    for (const [key, arg] of constraints) {
      const v = this.cond(
        bp[key] as Length | undefined,
        ep[key] as Length | undefined,
        (l) => this.length(l),
        "nil",
      );
      if (v !== undefined) out.push(`${p}.frame(${arg}: ${v})`);
    }
    return out;
  }

  private sizeFrame(axis: "w" | "h", b: Node, e: Node, p: string): string[] {
    const widthArg = axis === "w" ? "width" : "height";
    const maxArg = axis === "w" ? "maxWidth" : "maxHeight";
    const bv = sizeOf(b, axis);
    const ev = sizeOf(e, axis);
    if (sameSize(bv, ev)) {
      if (bv.kind === "hug") return [];
      if (bv.kind === "fill") return [`${p}.frame(${maxArg}: .infinity)`];
      return [`${p}.frame(${widthArg}: ${this.length(bv.value)})`];
    }
    this.usesSizeClass = true;
    const width = (s: Size): string =>
      s.kind === "fixed" ? this.length(s.value) : "nil";
    const max = (s: Size): string => (s.kind === "fill" ? ".infinity" : "nil");
    const out: string[] = [];
    const wb = width(bv);
    const we = width(ev);
    const mb = max(bv);
    const me = max(ev);
    if (wb !== we)
      out.push(
        `${p}.frame(${widthArg}: sizeClass == .compact ? ${wb} : ${we})`,
      );
    if (mb !== me)
      out.push(`${p}.frame(${maxArg}: sizeClass == .compact ? ${mb} : ${me})`);
    return out;
  }

  // -- feuilles ---------------------------------------------------------------

  private text(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    if (b.type !== "Text" || e.type !== "Text") return;
    const font = this.cond(
      b.props.style,
      e.props.style,
      (t) => this.token(t),
      "T.type.body.md",
    );
    const color = this.cond(
      b.props.color,
      e.props.color,
      (t) => this.token(t),
      "T.color.text.primary",
    );
    if (font !== undefined && color !== undefined)
      push(`${p}.font(${font}).foregroundStyle(${color})`);
    const lines = this.cond(
      b.props.maxLines,
      e.props.maxLines,
      (n) => String(n),
      "nil",
    );
    if (lines !== undefined && lines !== "nil")
      push(`${p}.lineLimit(${lines})`);
    const truncate = this.cond(
      b.props.truncate,
      e.props.truncate,
      (t) => (t === "none" ? ".none" : ".tail"),
      ".tail",
    );
    if (truncate !== undefined && truncate !== ".tail")
      push(`${p}.truncationMode(${truncate})`);
    const align = this.cond(
      b.props.align,
      e.props.align,
      (a) =>
        a === "center" ? ".center" : a === "end" ? ".trailing" : ".leading",
      ".leading",
    );
    if (align !== undefined && align !== ".leading")
      push(`${p}.multilineTextAlignment(${align})`);
  }

  private image(
    b: Node,
    e: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    if (b.type !== "Image" || e.type !== "Image") return;
    const fit = this.cond(
      b.props.fit,
      e.props.fit,
      (f) => (f === "contain" ? ".fit" : ".fill"),
      ".fill",
    );
    const ratio = this.cond(
      b.props.ratio,
      e.props.ratio,
      (r) => `${String(r[0])} / ${String(r[1])}`,
      "nil",
    );
    if (ratio !== undefined && ratio !== "nil")
      push(`${p}.aspectRatio(${ratio}, contentMode: ${fit ?? ".fill"})`);
    else if (fit !== undefined && fit !== ".fill")
      push(`${p}.aspectRatio(contentMode: ${fit})`);
    const radius = this.cond(
      b.props.radius,
      e.props.radius,
      (t) => this.token(t),
      "0",
    );
    if (radius !== undefined && radius !== "0")
      push(`${p}.clipShape(RoundedRectangle(cornerRadius: ${radius}))`);
  }

  private accessibility(
    b: Node,
    p: string,
    push: (line: string) => void,
  ): void {
    const role = b.props.role ?? { kind: "none" };
    if (b.props.label !== undefined)
      push(`${p}.accessibilityLabel(${swiftString(b.props.label)})`);
    if (role.kind === "heading") push(`${p}.accessibilityAddTraits(.isHeader)`);
    if (role.kind === "button") push(`${p}.accessibilityAddTraits(.isButton)`);
    if (role.kind === "image") push(`${p}.accessibilityAddTraits(.isImage)`);
    if (role.kind === "decorative") push(`${p}.accessibilityHidden(true)`);
  }

  // -- fichiers ---------------------------------------------------------------

  private genFile(body: readonly string[]): string {
    const name = layoutName(this.screen.name);
    const slots = this.slots.map((s) => `  let ${s.name}: ${s.type}`);
    const header = [
      `// Généré depuis ${this.screen.name}.ir par ir-backend-swiftui. Ne pas éditer : zone générée (spec §9).`,
      "import SwiftUI",
      "",
      `struct ${name}: View {`,
      ...slots,
    ];
    if (slots.length > 0) header.push("");
    const out = [...header, "  var body: some View {", ...body, "  }"];
    if (this.usesSizeClass)
      out.push(
        "",
        "  @Environment(\\.horizontalSizeClass) private var sizeClass",
      );
    const previewArgs = this.slots
      .map((s) => `${s.name}: ${this.sample(s)}`)
      .join(", ");
    out.push("}", "", `#Preview { ${name}(${previewArgs}) }`, "");
    return out.join("\n");
  }

  private sample(slot: Slot): string {
    const text = this.options.samples?.[slot.name] ?? slot.name;
    return slot.type === "String"
      ? swiftString(text)
      : `ImageSource(name: ${swiftString(text)})`;
  }

  private preservedFile(): string {
    const name = layoutName(this.screen.name);
    const view = viewName(this.screen.name);
    const props = this.slots
      .map(
        (s) =>
          `${s.name}: ${swiftString(this.options.samples?.[s.name] ?? s.name)}`,
      )
      .join(", ");
    return [
      `// Zone préservée (spec §9) : écrite une seule fois par ir-backend-swiftui, jamais réécrite. Votre logique va ici.`,
      "import SwiftUI",
      "",
      `struct ${view}: View {`,
      "  var body: some View {",
      `    ${name}(${props})`,
      "  }",
      "}",
      "",
    ].join("\n");
  }
}

// ---------------------------------------------------------------------------

function pad(depth: number): string {
  return INDENT.repeat(depth);
}

function sameSize(a: Size, b: Size): boolean {
  if (a.kind === "hug" || a.kind === "fill") return a.kind === b.kind;
  if (b.kind !== "fixed") return false;
  return lengthEquals(a.value, b.value);
}

function lengthEquals(a: Length, b: Length): boolean {
  if (typeof a === "number" || typeof b === "number") return a === b;
  const ta = a as Token;
  const tb = b as Token;
  return (
    ta.group === tb.group &&
    ta.path.length === tb.path.length &&
    ta.path.every((s, i) => s === tb.path[i])
  );
}
