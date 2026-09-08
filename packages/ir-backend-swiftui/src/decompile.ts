/**
 * Décompilateur SwiftUI → IR (T11, spec §9.2, §11.2, loi 2).
 *
 * Lit uniquement la zone générée (`XLayout.gen.swift`) avec le design system,
 * et rend la forme normale. C'est un parsing de forme, l'inverse de §11.2, sans
 * analyse sémantique : le fichier est lu ligne à ligne, tel que le compilateur
 * l'écrit. Les trois motifs de §11.2 sont reconnus : les `Spacer` → `mainAlign`,
 * `.frame(maxWidth/maxHeight: .infinity)` sur tous les enfants → `crossAlign:
 * stretch`, et `sizeClass == .compact ? a : b` → surcharge `@expanded`. Tout ce
 * qui sort de ces formes est E003, un nom inconnu E002, un `.irNode` dupliqué
 * E005. Le décompilateur ne devine jamais. Pur : aucune I/O.
 */

import {
  BASE_BREAKPOINT,
  PROP_SPECS,
  fail,
  irError,
  normalize,
  ok,
  withProps,
} from "ir-core";
import type {
  Border,
  Content,
  DesignSystem,
  Dir,
  GenericOverride,
  IRError,
  Length,
  Node,
  NodeType,
  Normalized,
  Props,
  Result,
  Size,
  Token,
  TokenEntry,
  TokenGroup,
} from "ir-core";

import { camel, swiftIdentifier } from "./tokens.js";

export interface SwiftSources {
  readonly gen: string;
}

export interface SwiftDecompileOptions {
  readonly designSystem: DesignSystem;
}

// ---------------------------------------------------------------------------
// Index des noms Swift → tokens
// ---------------------------------------------------------------------------

interface SwiftIndex {
  /** Expression `T.groupe.sous.nom` → token, pour la décompilation. */
  readonly tokens: ReadonlyMap<string, TokenEntry>;
  /** `T.icon.<camel>` → nom d'icône du design system. */
  readonly icons: ReadonlyMap<string, string>;
}

export function swiftTokenIndex(ds: DesignSystem): Result<SwiftIndex> {
  const tokens = new Map<string, TokenEntry>();
  const icons = new Map<string, string>();
  const errors: IRError[] = [];
  for (const entry of ds.tokens.values()) {
    if (!entry.referenceable || entry.path[0] === "bp") continue;
    const expr = `T.${entry.path.map(swiftIdentifier).join(".")}`;
    const other = tokens.get(expr);
    if (other === undefined) tokens.set(expr, entry);
    else
      errors.push(
        irError(
          "E010",
          entry.path.join("."),
          `« ${entry.path.join(".")} » et « ${other.path.join(".")} » ont le même nom Swift « ${expr} » : le code généré ne pourrait pas les distinguer (loi 2). Renommer l'un des deux. (décompilateur SwiftUI)`,
        ),
      );
  }
  for (const [name] of ds.icons) {
    const expr = `T.icon.${swiftIdentifier(camel([name]))}`;
    const other = icons.get(expr);
    if (other === undefined) icons.set(expr, name);
    else
      errors.push(
        irError(
          "E010",
          `icons.${name}`,
          `Les icônes « ${name} » et « ${other} » ont le même nom Swift « ${expr} » : la décompilation ne pourrait pas les distinguer (loi 2).`,
        ),
      );
  }
  return errors.length > 0 ? fail(errors) : ok({ tokens, icons });
}

// ---------------------------------------------------------------------------
// Parsing du fichier généré
// ---------------------------------------------------------------------------

interface Modifier {
  readonly name: string;
  readonly args: string;
  readonly line: number;
}

interface ParsedNode {
  readonly type: NodeType;
  readonly id: string;
  readonly line: number;
  /** Stack : balise d'ouverture et arguments bruts. */
  readonly stackTag?: string;
  readonly stackArgs?: string;
  /** `vertical`/`horizontal` si le Stack est enveloppé dans un ScrollView. */
  readonly scrollAxis?: string;
  /** Stack : enfants et Spacers, dans l'ordre. */
  readonly body?: readonly (ParsedNode | "spacer")[];
  /** Feuille : expression de base. */
  readonly base?: string;
  readonly modifiers: readonly Modifier[];
}

class Malformed extends Error {
  constructor(readonly diagnostic: IRError) {
    super(diagnostic.message);
  }
}

const malformed = (line: number, message: string): Malformed =>
  new Malformed(
    irError(
      "E003",
      "",
      `Ligne ${String(line)} du fichier généré : ${message} (décompilateur SwiftUI)`,
    ),
  );

function parseSwiftFile(
  gen: string,
): Result<{ name: string; root: ParsedNode }> {
  try {
    const lines = gen.split("\n");
    const structLine = lines.findIndex((l) =>
      /^struct [A-Za-z0-9_]+: View \{/.test(l),
    );
    if (structLine < 0) throw malformed(1, "struct X: View attendu");
    const structName =
      /^struct ([A-Za-z0-9_]+): View \{/.exec(lines[structLine] ?? "")?.[1] ??
      "";
    const header = lines.find((l) => l.startsWith("// Généré depuis "));
    const name =
      header === undefined
        ? structName.replace(/Layout$/, "")
        : (/^\/\/ Généré depuis (.+)\.ir /.exec(header)?.[1] ??
          structName.replace(/Layout$/, ""));
    const bodyStart = lines.findIndex(
      (l, i) => i > structLine && l === "  var body: some View {",
    );
    if (bodyStart < 0)
      throw malformed(structLine + 1, "var body: some View attendu");
    const p = new Parser(lines, bodyStart + 1);
    const root = p.parseNode(4);
    if (root === undefined) throw malformed(bodyStart + 1, "aucun nœud racine");
    return ok({ name, root });
  } catch (e) {
    if (e instanceof Malformed) return fail([e.diagnostic]);
    throw e;
  }
}

/** Lecture ligne à ligne, par indentation (le compilateur écrit un modificateur par ligne). */
class Parser {
  private i: number;
  constructor(
    private readonly lines: string[],
    start: number,
  ) {
    this.i = start;
  }

  private line(): { raw: string; no: number } {
    return { raw: this.lines[this.i] ?? "", no: this.i + 1 };
  }

  private indent(raw: string): number {
    return raw.length - raw.trimStart().length;
  }

  private skipBlank(): void {
    while (
      this.i < this.lines.length &&
      (this.lines[this.i] ?? "").trim() === ""
    )
      this.i++;
  }

  /** Rend un nœud à l'indentation `indent`, ou undefined si la ligne ne correspond pas. */
  parseNode(indent: number): ParsedNode | undefined {
    this.skipBlank();
    if (this.i >= this.lines.length) return undefined;
    const { raw, no } = this.line();
    if (this.indent(raw) !== indent) return undefined;
    return this.parseAt(no, indent);
  }

  /** Parse la ligne courante (déjà indentée à `indent`) comme un nœud. */
  private parseAt(no: number, indent: number): ParsedNode {
    const raw = this.lines[this.i] ?? "";
    const t = raw.trim();
    const open = t.endsWith("{") && !t.startsWith("ScrollView");
    if (open || t.startsWith("ScrollView")) {
      return this.parseStack(no, indent);
    }
    if (t.startsWith("Spacer(")) throw malformed(no, "Spacer hors d'un Stack");
    return this.parseLeaf(no, indent);
  }

  private parseStack(no: number, indent: number): ParsedNode {
    const t = (this.lines[this.i] ?? "").trim();
    let tag: string;
    let args: string;
    let scrollAxis: string | undefined;
    let body: (ParsedNode | "spacer")[];

    if (t.startsWith("ScrollView")) {
      const m = /^ScrollView\(\.(vertical|horizontal)\) \{/.exec(t);
      if (m === null)
        throw malformed(no, "ScrollView(.vertical/.horizontal) attendu");
      scrollAxis = m[1] ?? "";
      this.i++;
      // Le conteneur intérieur (VStack/HStack) est le même nœud.
      this.skipBlank();
      const inner = (this.lines[this.i] ?? "").trim();
      const im = /^([A-Za-z]+)(\(([\s\S]*)\))? \{$/.exec(inner);
      if (im === null)
        throw malformed(
          this.i + 1,
          `conteneur interne attendu dans ScrollView, trouvé : ${inner}`,
        );
      tag = im[1] ?? "";
      args = im[3] ?? "";
      this.i++;
      body = this.parseBody(no, indent + 2);
      this.skipBlank();
      const close = (this.lines[this.i] ?? "").trim();
      if (close !== "}")
        throw malformed(
          this.i + 1,
          `accolade fermante du ScrollView attendue : ${close}`,
        );
      this.i++;
    } else {
      const m = /^([A-Za-z]+)(\(([\s\S]*)\))? \{$/.exec(t);
      if (m === null) throw malformed(no, `conteneur attendu, trouvé : ${t}`);
      tag = m[1] ?? "";
      args = m[3] ?? "";
      this.i++;
      body = this.parseBody(no, indent);
    }

    const modifiers = this.parseModifiers(no, indent);
    const id = modifiers.find((m) => m.name === "irNode")?.args ?? "";
    if (id === "") throw malformed(no, `.irNode("id") manquant`);
    if (tag !== "VStack" && tag !== "HStack" && tag !== "AnyLayout")
      throw malformed(no, `conteneur ${tag} inattendu`);
    return {
      type: "Stack",
      id: unquote(id),
      line: no,
      stackTag: tag,
      stackArgs: args,
      ...(scrollAxis === undefined ? {} : { scrollAxis }),
      body,
      modifiers: modifiers.filter((m) => m.name !== "irNode"),
    };
  }

  /** Enfants (et Spacers) jusqu'à l'accolade fermante à `indent`, consommée. */
  private parseBody(no: number, indent: number): (ParsedNode | "spacer")[] {
    const body: (ParsedNode | "spacer")[] = [];
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length) throw malformed(no, "Stack non fermé");
      const cur = this.lines[this.i] ?? "";
      const ind = this.indent(cur);
      if (ind < indent) throw malformed(no, "Stack non fermé");
      if (ind === indent) {
        if (cur.trim() !== "}")
          throw malformed(
            this.i + 1,
            `accolade fermante attendue, trouvé : ${cur.trim()}`,
          );
        this.i++;
        return body;
      }
      if (cur.trim().startsWith("Spacer(")) {
        if (cur.trim() !== "Spacer(minLength: 0)")
          throw malformed(
            this.i + 1,
            `Spacer(minLength: 0) attendu, trouvé : ${cur.trim()}`,
          );
        body.push("spacer");
        this.i++;
        continue;
      }
      body.push(this.parseAt(this.i + 1, indent + 2));
    }
  }

  private parseLeaf(no: number, indent: number): ParsedNode {
    const t = (this.lines[this.i] ?? "").trim();
    const type = leafType(t);
    if (type === undefined)
      throw malformed(no, `feuille attendue, trouvé : ${t}`);
    const base = t;
    this.i++;
    const modifiers = this.parseModifiers(no, indent + 2);
    const id = modifiers.find((m) => m.name === "irNode")?.args ?? "";
    if (id === "") throw malformed(no, `.irNode("id") manquant`);
    return {
      type,
      id: unquote(id),
      line: no,
      base,
      modifiers: modifiers.filter((m) => m.name !== "irNode"),
    };
  }

  /** Modificateurs consécutifs à l'indentation `indent`, jusqu'à `.irNode` compris. */
  private parseModifiers(no: number, indent: number): Modifier[] {
    const out: Modifier[] = [];
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const cur = this.lines[this.i] ?? "";
      if (cur.trim() === "") break;
      if (this.indent(cur) < indent) break;
      if (this.indent(cur) !== indent)
        throw malformed(this.i + 1, `indentation inattendue : ${cur}`);
      const mods = modifiersOf(cur, this.i + 1);
      out.push(...mods);
      this.i++;
      if (mods.some((m) => m.name === "irNode")) break;
    }
    void no;
    return out;
  }
}

/** Type de feuille d'après son expression de base. */
function leafType(t: string): NodeType | undefined {
  if (t.startsWith("Text(")) return "Text";
  if (t.startsWith("Image(systemName:")) return "Icon";
  if (t.startsWith("Image(")) return "Image";
  if (t.startsWith("Rectangle(") || t.startsWith("RoundedRectangle("))
    return "Box";
  return undefined;
}

/** Découpe une ligne en modificateurs, chaînés ou non. */
function modifiersOf(line: string, no: number): Modifier[] {
  const t = line.trim();
  const out: Modifier[] = [];
  let i = 0;
  while (i < t.length && t[i] === ".") {
    i++;
    const nameStart = i;
    while (i < t.length && /[A-Za-z]/.test(t[i] ?? "")) i++;
    const name = t.slice(nameStart, i);
    if (t[i] === "(") {
      let depth = 0;
      let j = i;
      while (j < t.length) {
        const c = t[j] ?? "";
        if (c === '"') {
          j = skipString(t, j);
          continue;
        }
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        j++;
      }
      if (depth !== 0) throw malformed(no, `parenthèse non fermée : ${t}`);
      out.push({ name, args: t.slice(i + 1, j - 1), line: no });
      i = j;
    } else {
      out.push({ name, args: "", line: no });
    }
  }
  if (i !== t.length)
    throw malformed(no, `modificateur attendu, trouvé : ${t.slice(i)}`);
  return out;
}

const unquote = (s: string): string => {
  try {
    const v: unknown = JSON.parse(s.trim());
    if (typeof v === "string") return v;
  } catch {
    // signalé ailleurs
  }
  return s.trim().replace(/^"|"$/g, "");
};

// ---------------------------------------------------------------------------
// Reconstruction de l'IR
// ---------------------------------------------------------------------------

const HUG: Size = { kind: "hug" };
const FILL: Size = { kind: "fill" };
const NONE: Token<"space"> = { group: "space", path: ["none"] };

class Decompiler {
  private readonly errors: IRError[] = [];
  private readonly ids = new Set<string>();
  private readonly breakpoints: readonly string[];

  constructor(
    private readonly ds: DesignSystem,
    private readonly index: SwiftIndex,
  ) {
    this.breakpoints = [...ds.breakpoints.keys()].filter(
      (n) => n !== BASE_BREAKPOINT,
    );
  }

  run(name: string, root: ParsedNode): Result<Normalized> {
    const node = this.node(root, undefined, undefined, "");
    if (node === undefined) return fail(this.errors);
    if (this.errors.length > 0) return fail(this.errors);
    return ok(normalize({ name, root: node }));
  }

  private report(
    code: "E002" | "E003" | "E005",
    path: string,
    message: string,
  ): void {
    this.errors.push(irError(code, path, `${message} (décompilateur SwiftUI)`));
  }

  private node(
    p: ParsedNode,
    parent: ParsedNode | undefined,
    parentDir: Dir | undefined,
    parentPath: string,
  ): Node | undefined {
    const id = p.id;
    const path = parentPath === "" ? id : `${parentPath}/${id}`;
    const bad = (message: string): void => this.report("E003", path, message);
    if (this.ids.has(id))
      this.report("E005", path, `.irNode("${id}") dupliqué`);
    this.ids.add(id);

    const base = this.decode(p, parent, parentDir, path, BASE_BREAKPOINT);
    const expanded: Record<string, unknown>[] = this.breakpoints.map((bp) =>
      this.decode(p, parent, parentDir, path, bp),
    );

    const overrides: GenericOverride[] = [];
    this.breakpoints.forEach((bp, k) => {
      const diff: Record<string, unknown> = {};
      for (const spec of PROP_SPECS[p.type]) {
        if (!spec.overridable) continue;
        const value = expanded[k]?.[spec.key];
        if (deepEqual(value, base[spec.key])) continue;
        if (value === undefined) {
          bad(
            `@${bp} retire ${spec.key}, qu'une surcharge ne peut pas retirer (§4.7)`,
          );
          continue;
        }
        diff[spec.key] = value;
      }
      if (Object.keys(diff).length > 0)
        overrides.push({ breakpoint: bp, props: diff });
    });

    let children: Node[] = [];
    if (p.type === "Stack" && p.body !== undefined) {
      children = p.body.flatMap((item) => {
        if (item === "spacer") return [];
        const n = this.node(item, p, base["dir"] as Dir | undefined, path);
        return n === undefined ? [] : [n];
      });
    }

    const props: Props = { ...base };
    const content =
      p.type === "Text" || p.type === "Image"
        ? this.content(p, path)
        : undefined;
    const skeleton = this.skeleton(p.type, id, content, children);
    return withProps(skeleton, props, overrides);
  }

  private content(p: ParsedNode, path: string): Content | undefined {
    const t = p.base ?? "";
    const bad = (message: string): void => this.report("E003", path, message);
    if (p.type === "Text") {
      const m = /^Text\(([\s\S]*)\)$/.exec(t);
      if (m === null) {
        bad("Text(...) attendu");
        return undefined;
      }
      const arg = m[1] ?? "";
      if (arg.startsWith('"')) return { kind: "literal", value: unquote(arg) };
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg))
        return { kind: "slot", name: arg };
      bad(`contenu de Text inattendu : ${arg}`);
      return undefined;
    }
    // Image (pas Icon) : Image("...") ou Image(source: slot)
    const m = /^Image\(([\s\S]*)\)$/.exec(t);
    if (m === null) {
      bad("Image(...) attendu");
      return undefined;
    }
    const arg = m[1] ?? "";
    if (arg.startsWith('"')) return { kind: "literal", value: unquote(arg) };
    const slot = /^source: ([A-Za-z_][A-Za-z0-9_]*)$/.exec(arg);
    if (slot !== null) return { kind: "slot", name: slot[1] ?? "" };
    bad(`contenu d'Image inattendu : ${arg}`);
    return undefined;
  }

  /** Décode les propriétés résolues d'un nœud à un breakpoint. */
  private decode(
    p: ParsedNode,
    parent: ParsedNode | undefined,
    parentDir: Dir | undefined,
    path: string,
    bp: string,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (key: string, value: unknown): void => {
      if (value !== undefined) out[key] = value;
    };
    const bad = (message: string): void =>
      this.report("E003", path, `${message} (@${bp})`);

    const mods = p.modifiers;
    const read = (name: string): Modifier | undefined => {
      // Un seul modificateur de chaque nom (le compilateur n'en émet jamais deux).
      return mods.find((m) => m.name === name);
    };
    const ev = (m: Modifier | undefined): string | undefined =>
      m === undefined ? undefined : evalTernary(m.args, bp);

    // Frames : w/h puis contraintes. Le compilateur émet un `.frame` par
    // contrainte ; `.frame(maxWidth: .infinity)` (w fill) et
    // `.frame(maxWidth: n)` (maxW) peuvent donc coexister.
    if (p.type !== "Icon") {
      const frames = mods.filter((m) => m.name === "frame");
      const pairs: [string, string][] = [];
      for (const f of frames) {
        for (const [key, value] of splitNamedArgs(f.args))
          pairs.push([key, evalTernary(value, bp)]);
      }
      const take = (key: string): string[] =>
        pairs.filter(([k]) => k === key).map(([, v]) => v);
      const width = take("width");
      const height = take("height");
      const maxWidth = take("maxWidth");
      const maxHeight = take("maxHeight");
      const cross: "w" | "h" | undefined =
        parentDir === "v" ? "w" : parentDir === "h" ? "h" : undefined;
      const stretch = this.parentStretch(parent, parentDir, bp);
      out["w"] = this.decodeSize(
        width[0],
        maxWidth,
        cross === "w" && stretch,
        path,
        bp,
        "w",
        bad,
      );
      out["h"] = this.decodeSize(
        height[0],
        maxHeight,
        cross === "h" && stretch,
        path,
        bp,
        "h",
        bad,
      );
      for (const [key, arg] of [
        ["minW", "minWidth"],
        ["maxW", "maxWidth"],
        ["minH", "minHeight"],
        ["maxH", "maxHeight"],
      ] as const) {
        const v = take(arg).find((x) => x !== "nil" && x !== ".infinity");
        if (v !== undefined) set(key, this.length(v, path, bp, arg, bad));
      }
    }

    if (p.type === "Stack") {
      let dir: Dir;
      let stackArgs: string;
      if (p.stackTag === "AnyLayout") {
        const branch = anyLayoutBranch(evalTernary(p.stackArgs ?? "", bp));
        dir = branch.dir;
        stackArgs = branch.args;
      } else {
        dir = p.stackTag === "HStack" ? "h" : "v";
        stackArgs = p.stackArgs ?? "";
      }
      set("dir", dir);
      const args = splitNamedArgs(stackArgs);
      const gap = evalTernary(args.get("spacing") ?? "", bp);
      out["gap"] =
        gap === "" || gap === "T.space.none"
          ? NONE
          : this.token(gap, "space", path, bp, "spacing", bad);
      const alignment = evalTernary(args.get("alignment") ?? "", bp);
      if (alignment === "") set("crossAlign", "stretch");
      else set("crossAlign", this.crossAlign(alignment, dir));
      // pad
      const padM = read("padding");
      const padV = ev(padM);
      out["pad"] =
        padV === undefined || padV === "T.space.none"
          ? NONE
          : this.pad(padV, path, bp, bad);
      // overflow : clip par .clipped(), scroll par ScrollView
      const clip = read("clipped");
      if (clip !== undefined) set("overflow", "clip");
      else if (p.scrollAxis !== undefined) {
        const ax = p.scrollAxis === "vertical" ? "v" : "h";
        if (ax !== dir) bad("ScrollView sur l'axe secondaire");
        set("overflow", "scroll");
      } else set("overflow", "visible");
      // mainAlign depuis les Spacers (motif 2). Un Stack hug n'a pas de Spacer.
      out["mainAlign"] = this.mainAlign(p.body ?? []);
    }

    // Style commun Stack/Box, et bg de Box (.fill).
    const bgMod = p.type === "Box" ? read("fill") : read("background");
    let bgV = ev(bgMod);
    if (bgV !== undefined && p.type !== "Box")
      bgV = bgV.split(", in:")[0]?.trim() ?? "";
    if (bgV !== undefined && bgV !== "" && bgV !== "Color.clear")
      set("bg", this.token(bgV, "color", path, bp, "background", bad));

    // radius : sur RoundedRectangle (Box), .background in:, ou .clipShape.
    const radius = this.decodeRadius(p, path, bp, bad);
    if (radius !== undefined) set("radius", radius);

    // border (.overlay), opacity, shadow.
    const ov = read("overlay");
    if (ov !== undefined) {
      const b = this.decodeBorder(ev(ov) ?? "", path, bp, bad);
      if (b !== undefined) set("border", b);
    }
    const op = ev(read("opacity"));
    if (op !== undefined && op !== "1")
      set("opacity", this.token(op, "opacity", path, bp, "opacity", bad));
    const sh = ev(read("shadow"));
    if (sh !== undefined && sh !== "nil")
      set("shadow", this.token(sh, "shadow", path, bp, "shadow", bad));

    if (p.type === "Text") {
      const ff = read("font");
      const fs = read("foregroundStyle");
      const fontV = ev(ff);
      const colorV = ev(fs);
      if (fontV !== undefined)
        set("style", this.token(fontV, "type", path, bp, "font", bad));
      if (colorV !== undefined)
        set(
          "color",
          this.token(colorV, "color", path, bp, "foregroundStyle", bad),
        );
      const lines = ev(read("lineLimit"));
      if (lines !== undefined && lines !== "nil")
        set("maxLines", Number(lines));
      const trunc = ev(read("truncationMode"));
      if (out["maxLines"] !== undefined)
        out["truncate"] = trunc === ".none" ? "none" : "end";
      const align = ev(read("multilineTextAlignment"));
      out["align"] =
        align === ".center"
          ? "center"
          : align === ".trailing"
            ? "end"
            : "start";
    }

    if (p.type === "Image") {
      const fit = ev(read("aspectRatio"));
      // ratio et fit partagent .aspectRatio ; le ratio porte « / ».
      if (fit === undefined) out["fit"] = "cover";
      else if (fit.includes("/")) {
        const m = /^([\d.]+) \/ ([\d.]+), contentMode: ([\s\S]+)$/.exec(fit);
        if (m === null) bad(`aspectRatio inattendu : ${fit}`);
        else {
          set("ratio", [Number(m[1]), Number(m[2])]);
          const cm = evalTernary(m[3] ?? "", bp);
          out["fit"] = cm === ".fit" ? "contain" : "cover";
        }
      } else {
        const m = /^contentMode: ([\s\S]+)$/.exec(fit);
        if (m === null) bad(`aspectRatio inattendu : ${fit}`);
        else {
          const cm = evalTernary(m[1] ?? "", bp);
          out["fit"] = cm === ".fit" ? "contain" : "cover";
        }
      }
    }

    if (p.type === "Icon") {
      const t = p.base ?? "";
      const m =
        /^Image\(systemName: (.+)\)\.font\(\.system\(size: (.+)\)\)$/.exec(t);
      if (m === null)
        bad(`Image(systemName:).font(.system(size:)) attendu, trouvé : ${t}`);
      else {
        const name = this.index.icons.get(m[1] ?? "");
        if (name === undefined)
          this.report(
            "E002",
            path,
            `Icône Swift « ${m[1] ?? ""} » inconnue d'icons.json`,
          );
        else set("name", { group: "icon", path: [name] });
        set(
          "size",
          this.token(
            evalTernary(m[2] ?? "", bp),
            "size",
            path,
            bp,
            "size",
            bad,
          ),
        );
      }
      const color = ev(read("foregroundStyle"));
      if (color !== undefined)
        set(
          "color",
          this.token(color, "color", path, bp, "foregroundStyle", bad),
        );
    }

    // Rôle et label (accessibilité).
    const label = ev(read("accessibilityLabel"));
    if (label !== undefined) set("label", unquote(label));
    const traits = read("accessibilityAddTraits");
    if (traits !== undefined) {
      const tv = evalTernary(traits.args, bp);
      if (tv === ".isHeader") set("role", { kind: "heading", level: 1 });
      else if (tv === ".isButton") set("role", { kind: "button" });
      else if (tv === ".isImage") set("role", { kind: "image" });
      else bad(`accessibilityAddTraits inattendu : ${tv ?? ""}`);
    }
    const hidden = read("accessibilityHidden");
    if (hidden !== undefined) set("role", { kind: "decorative" });

    // Signaler les modificateurs inconnus.
    const known = new Set([
      "frame",
      "padding",
      "background",
      "fill",
      "overlay",
      "clipped",
      "clipShape",
      "opacity",
      "shadow",
      "font",
      "foregroundStyle",
      "lineLimit",
      "truncationMode",
      "multilineTextAlignment",
      "aspectRatio",
      "accessibilityLabel",
      "accessibilityAddTraits",
      "accessibilityHidden",
    ]);
    for (const m of p.modifiers) {
      if (!known.has(m.name)) bad(`modificateur inattendu : .${m.name}`);
    }
    return out;
  }

  private decodeSize(
    width: string | undefined,
    maxWidth: readonly string[],
    stretched: boolean,
    path: string,
    bp: string,
    axis: "w" | "h",
    bad: (message: string) => void,
  ): Size {
    const arg = axis === "w" ? "width" : "height";
    if (width !== undefined && width !== "nil") {
      const len = this.length(width, path, bp, arg, bad);
      return len === undefined ? HUG : { kind: "fixed", value: len };
    }
    // `.frame(maxWidth: .infinity)` : `w: fill`, ou l'étirement de
    // `crossAlign: stretch` sur un enfant `hug` (motif 1 de §11.2).
    if (maxWidth.includes(".infinity")) return stretched ? HUG : FILL;
    return HUG;
  }

  /** Le parent est-il en `crossAlign: stretch` à ce breakpoint (pas d'`alignment`)? */
  private parentStretch(
    parent: ParsedNode | undefined,
    dir: Dir | undefined,
    bp: string,
  ): boolean {
    if (
      parent === undefined ||
      parent.stackTag === undefined ||
      dir === undefined
    )
      return false;
    const args = splitNamedArgs(parent.stackArgs ?? "");
    const alignment = evalTernary(args.get("alignment") ?? "", bp);
    return alignment === "";
  }

  private crossAlign(alignment: string, dir: Dir): string {
    if (alignment === ".center") return "center";
    if (dir === "v") {
      if (alignment === ".leading") return "start";
      if (alignment === ".trailing") return "end";
    } else {
      if (alignment === ".top") return "start";
      if (alignment === ".bottom") return "end";
    }
    return "start";
  }

  private mainAlign(body: readonly (ParsedNode | "spacer")[]): string {
    const lead = body[0] === "spacer";
    const tail = body[body.length - 1] === "spacer";
    if (body.length > 1 && lead && tail) return "center";
    if (lead && body.length > 1) return "end";
    const middle = body.some(
      (b, i) => b === "spacer" && i > 0 && i < body.length - 1,
    );
    if (middle) return "between";
    return "start";
  }

  private decodeRadius(
    p: ParsedNode,
    path: string,
    bp: string,
    bad: (message: string) => void,
  ): Token<"radius"> | undefined {
    const radiusAt = (
      expr: string | undefined,
    ): Token<"radius"> | undefined => {
      if (expr === undefined) return undefined;
      const v = evalTernary(expr, bp);
      if (v === "0" || v === "") return undefined;
      return this.token(v, "radius", path, bp, "cornerRadius", bad);
    };
    if (p.type === "Box") {
      const m = /^RoundedRectangle\(cornerRadius: (.+)\)$/.exec(p.base ?? "");
      if (m !== null) return radiusAt(m[1] ?? "");
      return undefined;
    }
    const bg = p.modifiers.find((m) => m.name === "background");
    if (bg !== undefined) {
      const a = evalTernary(bg.args, bp) ?? "";
      const inM = /, in: RoundedRectangle\(cornerRadius: (.+)\)$/.exec(a);
      if (inM !== null) return radiusAt(inM[1] ?? "");
    }
    const clip = p.modifiers.find((m) => m.name === "clipShape");
    if (clip !== undefined) {
      const a = evalTernary(clip.args, bp) ?? "";
      const m = /^RoundedRectangle\(cornerRadius: (.+)\)$/.exec(a);
      if (m !== null) return radiusAt(m[1] ?? "");
    }
    return undefined;
  }

  private decodeBorder(
    expr: string,
    path: string,
    bp: string,
    bad: (message: string) => void,
  ): Border | undefined {
    const m = /^([\s\S]*)\.stroke\(([^,]+), lineWidth: ([^)]+)\)$/.exec(expr);
    if (m === null) {
      bad(`overlay sans .stroke attendu : ${expr}`);
      return undefined;
    }
    const color = evalTernary(m[2] ?? "", bp) ?? "";
    const size = evalTernary(m[3] ?? "", bp) ?? "";
    if (color === "Color.clear" || size === "0") return undefined;
    const c = this.token(color, "color", path, bp, "stroke", bad);
    const s = this.token(size, "size", path, bp, "lineWidth", bad);
    if (c === undefined || s === undefined) return undefined;
    return [s, c];
  }

  private pad(
    expr: string,
    path: string,
    bp: string,
    bad: (message: string) => void,
  ): unknown {
    const parts = expr.split(", ").map((x) => evalTernary(x, bp) ?? x);
    const tokens = parts.map((x) =>
      this.token(x, "space", path, bp, "padding", bad),
    );
    if (tokens.some((t) => t === undefined)) return undefined;
    const ok = tokens as Token<"space">[];
    if (ok.length === 1 && ok[0] !== undefined) return ok[0];
    if (ok.length === 2) return [ok[0], ok[1]];
    if (ok.length === 4) return [ok[0], ok[1], ok[2], ok[3]];
    bad(`padding : une, deux ou quatre valeurs attendues : ${expr}`);
    return undefined;
  }

  private length(
    value: string,
    path: string,
    bp: string,
    prop: string,
    bad: (message: string) => void,
  ): Length | undefined {
    const n = Number(value);
    if (value !== "" && !Number.isNaN(n)) return n;
    const t = this.token(value, "size", path, bp, prop, bad);
    return t;
  }

  private token<G extends TokenGroup>(
    value: string,
    group: G,
    path: string,
    bp: string,
    prop: string,
    bad: (message: string) => void,
  ): Token<G> | undefined {
    const entry = this.index.tokens.get(value);
    if (entry === undefined) {
      this.report(
        "E002",
        path,
        `${prop} : « ${value} » ne nomme aucun token référençable du design system (@${bp})`,
      );
      return undefined;
    }
    if (entry.path[0] !== group) {
      bad(
        `${prop} : $${entry.path.join(".")} est du groupe ${entry.path[0] ?? ""}, ${group} attendu`,
      );
      return undefined;
    }
    return { group, path: entry.path.slice(1) };
  }

  private skeleton(
    type: NodeType,
    id: string,
    content: Content | undefined,
    children: readonly Node[],
  ): Node {
    const c: Content = content ?? { kind: "literal", value: "" };
    const color: Token<"color"> = { group: "color", path: [] };
    switch (type) {
      case "Stack":
        return { type, id, props: { dir: "v" }, overrides: [], children };
      case "Box":
        return { type, id, props: {}, overrides: [] };
      case "Text":
        return {
          type,
          id,
          props: { style: { group: "type", path: [] }, color },
          overrides: [],
          content: c,
        };
      case "Image":
        return { type, id, props: {}, overrides: [], content: c };
      case "Icon":
        return {
          type,
          id,
          props: {
            name: { group: "icon", path: [] },
            size: { group: "size", path: [] },
            color,
          },
          overrides: [],
        };
    }
  }
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

/** `sizeClass == .compact ? a : b` → la valeur au breakpoint, sinon la valeur telle quelle. */
function evalTernary(expr: string, bp: string): string {
  const t = expr.trim();
  const prefix = "sizeClass == .compact ? ";
  if (!t.startsWith(prefix)) return t;
  const rest = t.slice(prefix.length);
  // Le ` : ` séparateur est au premier niveau de parenthèses seulement : les
  // branches peuvent contenir `alignment: …` ou `spacing: …`.
  let depth = 0;
  for (let i = 0; i < rest.length - 1; i++) {
    const c = rest[i] ?? "";
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === ":" && rest[i + 1] === " " && depth === 0) {
      const compact = rest.slice(0, i).trim();
      const expanded = rest.slice(i + 2).trim();
      return bp === BASE_BREAKPOINT ? compact : expanded;
    }
  }
  return t;
}

/** `AnyLayout(VStackLayout(alignment:…, spacing:…))` → direction et arguments internes. */
function anyLayoutBranch(branch: string): { dir: Dir; args: string } {
  const m = /^AnyLayout\(([A-Za-z]+Layout)(\(([\s\S]*)\))?\)$/.exec(
    branch.trim(),
  );
  if (m === null) return { dir: "v", args: "" };
  return { dir: m[1] === "HStackLayout" ? "h" : "v", args: m[3] ?? "" };
}

/** `a: b, c: d` → Map ; `a, b` → clés vides. Respecte les parenthèses. */
function splitNamedArgs(s: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of splitTop(s)) {
    const idx = part.indexOf(": ");
    if (idx < 0) out.set("", part.trim());
    else out.set(part.slice(0, idx).trim(), part.slice(idx + 2).trim());
  }
  return out;
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? "";
    if (c === '"') {
      const j = skipString(s, i);
      cur += s.slice(i, j);
      i = j - 1;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

/** Avance au-delà d'une chaîne entre guillemets (échappements JSON), `s[i] === '"'`. */
function skipString(s: string, i: number): number {
  i++;
  while (i < s.length) {
    const c = s[i] ?? "";
    if (c === "\\") i += 2;
    else if (c === '"') return i + 1;
    else i++;
  }
  return s.length;
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
    const pa = a as Readonly<Record<string, unknown>>;
    const pb = b as Readonly<Record<string, unknown>>;
    const ka = Object.keys(pa);
    return (
      ka.length === Object.keys(pb).length &&
      ka.every((k) => k in pb && deepEqual(pa[k], pb[k]))
    );
  }
  return false;
}

export function decompileSwift(
  sources: SwiftSources,
  options: SwiftDecompileOptions,
): Result<Normalized> {
  const index = swiftTokenIndex(options.designSystem);
  if (!index.ok) return fail(index.errors);
  const parsed = parseSwiftFile(sources.gen);
  if (!parsed.ok) return fail(parsed.errors);
  return new Decompiler(options.designSystem, index.value).run(
    parsed.value.name,
    parsed.value.root,
  );
}
