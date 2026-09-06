/**
 * Décompilateur React + CSS Modules → IR (T8, spec §9.1, loi 2).
 *
 * Lit uniquement la zone générée (`X.gen.tsx`, `X.gen.module.css`) avec le
 * design system, et rend la forme normale. C'est un parsing de forme, l'inverse
 * de la table §11.1, sans analyse sémantique : le TSX est lu ligne à ligne, un
 * élément par ligne tel que le compilateur l'écrit, et chaque règle CSS comme
 * un dictionnaire propriété → valeur. Tout ce qui sort de ces formes est E003,
 * un nom inconnu du design system E002, un `data-ir` dupliqué E005. Le
 * décompilateur ne devine jamais. Pur : aucune I/O.
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
  Content,
  DesignSystem,
  Dir,
  GenericOverride,
  IRError,
  Length,
  Node,
  NodeType,
  Normalized,
  Pad,
  Props,
  Result,
  Role,
  Size,
  Token,
  TokenEntry,
  TokenGroup,
} from "ir-core";

import { classAccess } from "./compile.js";
import { cssNameIndex } from "./tokens.js";

export interface CssSources {
  /** Contenu de `X.gen.tsx`. */
  readonly tsx: string;
  /** Contenu de `X.gen.module.css`. */
  readonly css: string;
}

export interface CssDecompileOptions {
  readonly designSystem: DesignSystem;
}

export function decompileCss(
  sources: CssSources,
  options: CssDecompileOptions,
): Result<Normalized> {
  const index = cssNameIndex(options.designSystem);
  if (!index.ok) return fail(index.errors);
  const css = parseCssModule(sources.css);
  const tsx = parseTsx(sources.tsx);
  if (!css.ok || !tsx.ok)
    return fail([...(css.ok ? [] : css.errors), ...(tsx.ok ? [] : tsx.errors)]);
  return new Decompiler(css.value, options.designSystem, index.value).run(
    tsx.value.name,
    tsx.value.root,
  );
}

// ---------------------------------------------------------------------------
// Module CSS : une règle par nœud, un dictionnaire par règle
// ---------------------------------------------------------------------------

export type Declarations = ReadonlyMap<string, string>;

export interface CssModule {
  /** Règle de base de chaque nœud, par identifiant, dans l'ordre du fichier. */
  readonly rules: ReadonlyMap<string, Declarations>;
  /** Blocs `@media (min-width: n px)` : seuil → identifiant → déclarations. */
  readonly media: ReadonlyMap<number, ReadonlyMap<string, Declarations>>;
}

const RULE = /^\.([A-Za-z_][A-Za-z0-9_-]*) \{$/;
const MEDIA = /^@media \(min-width: (\d+(?:\.\d+)?)px\) \{$/;
const DECL = /^([a-zA-Z-]+): (.+);$/;

/**
 * Lit le module CSS tel que le compilateur l'écrit : une déclaration par
 * ligne, une règle par nœud, un bloc `@media` par nœud et par breakpoint.
 * Une propriété répétée dans une règle est E003, comme toute autre forme.
 */
export function parseCssModule(css: string): Result<CssModule> {
  const errors: IRError[] = [];
  const e003 = (line: number, message: string): void => {
    errors.push(
      irError(
        "E003",
        "",
        `Ligne ${String(line)} du module CSS : ${message} (décompilateur CSS)`,
      ),
    );
  };
  const rules = new Map<string, Map<string, string>>();
  const media = new Map<number, Map<string, Map<string, string>>>();
  let mediaMin: number | undefined;
  let current: Map<string, string> | undefined;

  const lines = css.split("\n");
  lines.forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    if (t === "" || (t.startsWith("/*") && t.endsWith("*/"))) return;
    if (t === "}") {
      if (current !== undefined) current = undefined;
      else if (mediaMin !== undefined) mediaMin = undefined;
      else e003(line, "accolade fermante sans bloc ouvert");
      return;
    }
    const rule = RULE.exec(t);
    if (rule !== null) {
      const id = rule[1] ?? "";
      if (current !== undefined) {
        e003(line, `règle .${id} imbriquée dans une règle`);
        return;
      }
      let scope: Map<string, Map<string, string>> = rules;
      if (mediaMin !== undefined) {
        scope = media.get(mediaMin) ?? new Map<string, Map<string, string>>();
        media.set(mediaMin, scope);
      }
      current = new Map<string, string>();
      if (scope.has(id)) {
        e003(
          line,
          `règle .${id} dupliquée${mediaMin === undefined ? "" : ` dans @media (min-width: ${String(mediaMin)}px)`}`,
        );
        return;
      }
      scope.set(id, current);
      return;
    }
    const block = MEDIA.exec(t);
    if (block !== null) {
      if (current !== undefined || mediaMin !== undefined) {
        e003(line, "@media imbriqué");
        return;
      }
      mediaMin = Number(block[1]);
      if (!media.has(mediaMin)) media.set(mediaMin, new Map());
      return;
    }
    const decl = DECL.exec(t);
    if (decl !== null) {
      const prop = decl[1] ?? "";
      const value = decl[2] ?? "";
      if (current === undefined) {
        e003(line, `déclaration hors d'une règle : ${t}`);
        return;
      }
      if (current.has(prop)) {
        e003(line, `propriété ${prop} répétée dans la règle`);
        return;
      }
      current.set(prop, value);
      return;
    }
    e003(line, `ligne inattendue : ${t}`);
  });
  if (current !== undefined || mediaMin !== undefined)
    e003(lines.length, "bloc non fermé");
  return errors.length > 0 ? fail(errors) : ok({ rules, media });
}

/** Déclarations effectives à un breakpoint : la base recouverte par le bloc, `revert` retire. */
function overlay(base: Declarations, block: Declarations): Declarations {
  const out = new Map(base);
  for (const [prop, value] of block) {
    if (value === "revert") out.delete(prop);
    else out.set(prop, value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composant TSX : un élément par ligne
// ---------------------------------------------------------------------------

/** Valeur d'attribut `"…"` ou texte nu, ou expression `{…}` (son texte). */
type JsxValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "expr"; readonly text: string };

interface Element {
  readonly tag: string;
  readonly attrs: ReadonlyMap<string, JsxValue>;
  readonly children: Element[];
  /** Contenu d'un `<p>…</p>` sur la même ligne ; absent sinon. */
  readonly content: JsxValue | undefined;
  readonly line: number;
}

/** Interrompt la lecture du TSX : une forme que le compilateur n'écrit pas. */
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
      `Ligne ${String(line)} du composant généré : ${message} (décompilateur CSS)`,
    ),
  );

const IMPORT = /^import s from "\.\/(.+)\.gen\.module\.css";$/;
const CLOSE = /^<\/([A-Za-z][A-Za-z0-9]*)>$/;

function parseTsx(
  tsx: string,
): Result<{ readonly name: string; readonly root: Element }> {
  try {
    const lines = tsx.split("\n");
    const importLine = lines.find((l) => l.startsWith("import s from "));
    const named = importLine === undefined ? null : IMPORT.exec(importLine);
    if (named === null || named[1] === undefined)
      throw malformed(
        1,
        `import du module CSS attendu : import s from "./X.gen.module.css";`,
      );
    const start = lines.indexOf("  return (");
    const end = start < 0 ? -1 : lines.indexOf("  );", start);
    if (start < 0 || end < 0)
      throw malformed(1, "corps du composant attendu entre `return (` et `);`");

    const open: Element[] = [];
    let root: Element | undefined;
    for (let i = start + 1; i < end; i++) {
      const line = i + 1;
      const t = (lines[i] ?? "").trim();
      if (t.startsWith("</")) {
        const closing = CLOSE.exec(t);
        const top = open.pop();
        if (closing === null || top === undefined || closing[1] !== top.tag)
          throw malformed(line, `fermeture inattendue : ${t}`);
        continue;
      }
      const { element, closed } = parseElementLine(t, line);
      const parent = open[open.length - 1];
      if (parent === undefined) {
        if (root !== undefined) throw malformed(line, "plusieurs racines");
        root = element;
      } else {
        parent.children.push(element);
      }
      if (!closed) open.push(element);
    }
    const unclosed = open[open.length - 1];
    if (unclosed !== undefined)
      throw malformed(end + 1, `élément <${unclosed.tag}> non fermé`);
    if (root === undefined) throw malformed(start + 1, "aucun élément");
    return ok({ name: named[1], root });
  } catch (e) {
    if (e instanceof Malformed) return fail([e.diagnostic]);
    throw e;
  }
}

/** `<tag a="x" b={y}>`, `<tag … />` ou `<tag …>contenu</tag>`. */
function parseElementLine(
  t: string,
  line: number,
): { readonly element: Element; readonly closed: boolean } {
  const s = new Scanner(t, line);
  s.expect("<");
  const tag = s.read(/[A-Za-z0-9]/);
  if (tag === "") throw malformed(line, `balise attendue : ${t}`);
  const attrs = new Map<string, JsxValue>();
  let selfClosing = false;
  for (;;) {
    s.skipSpaces();
    if (s.startsWith("/>")) {
      s.advance(2);
      selfClosing = true;
      break;
    }
    if (s.startsWith(">")) {
      s.advance(1);
      break;
    }
    const name = s.read(/[A-Za-z0-9-]/);
    if (name === "") throw malformed(line, `attribut attendu : ${s.rest()}`);
    s.expect("=");
    const value = s.value();
    if (attrs.has(name)) throw malformed(line, `attribut ${name} répété`);
    attrs.set(name, value);
  }
  const element = (content: JsxValue | undefined): Element => ({
    tag,
    attrs,
    children: [],
    content,
    line,
  });
  if (selfClosing) {
    s.end();
    return { element: element(undefined), closed: true };
  }
  if (s.rest() === "") return { element: element(undefined), closed: false };
  const close = `</${tag}>`;
  let content: JsxValue;
  if (s.startsWith("{")) {
    content = s.value();
  } else {
    const rest = s.rest();
    if (!rest.endsWith(close))
      throw malformed(line, `${close} attendu en fin de ligne : ${rest}`);
    content = {
      kind: "string",
      value: rest.slice(0, rest.length - close.length),
    };
    s.advance(rest.length - close.length);
  }
  s.expect(close);
  s.end();
  return { element: element(content), closed: true };
}

class Scanner {
  private i = 0;
  constructor(
    private readonly text: string,
    private readonly line: number,
  ) {}

  rest(): string {
    return this.text.slice(this.i);
  }
  startsWith(s: string): boolean {
    return this.text.startsWith(s, this.i);
  }
  advance(n: number): void {
    this.i += n;
  }
  skipSpaces(): void {
    while (this.text[this.i] === " ") this.i++;
  }
  expect(s: string): void {
    if (!this.startsWith(s))
      throw malformed(
        this.line,
        `« ${s} » attendu, trouvé : ${this.rest() === "" ? "fin de ligne" : this.rest()}`,
      );
    this.i += s.length;
  }
  end(): void {
    if (this.i !== this.text.length)
      throw malformed(
        this.line,
        `texte inattendu en fin de ligne : ${this.rest()}`,
      );
  }
  read(char: RegExp): string {
    const start = this.i;
    while (this.i < this.text.length && char.test(this.text[this.i] ?? ""))
      this.i++;
    return this.text.slice(start, this.i);
  }

  /** `"…"` sans échappement (le compilateur passe par `{"…"}` sinon), ou `{…}` dont les chaînes JSON peuvent contenir `}`. */
  value(): JsxValue {
    if (this.startsWith('"')) {
      this.i++;
      const end = this.text.indexOf('"', this.i);
      if (end < 0) throw malformed(this.line, "guillemet fermant manquant");
      const value = this.text.slice(this.i, end);
      this.i = end + 1;
      return { kind: "string", value };
    }
    if (this.startsWith("{")) {
      this.i++;
      const start = this.i;
      while (this.i < this.text.length) {
        const c = this.text[this.i];
        if (c === "}") {
          const text = this.text.slice(start, this.i);
          this.i++;
          return { kind: "expr", text };
        }
        if (c === '"') this.skipJsonString();
        else this.i++;
      }
      throw malformed(this.line, "accolade fermante manquante");
    }
    throw malformed(this.line, `valeur attendue : ${this.rest()}`);
  }

  private skipJsonString(): void {
    this.i++;
    while (this.i < this.text.length && this.text[this.i] !== '"')
      this.i += this.text[this.i] === "\\" ? 2 : 1;
    if (this.i >= this.text.length)
      throw malformed(this.line, "chaîne non terminée");
    this.i++;
  }
}

// ---------------------------------------------------------------------------
// Reconstruction de l'IR
// ---------------------------------------------------------------------------

type Axis = "w" | "h";

interface Breakpoint {
  readonly name: string;
  readonly min: number;
}

/** Ce qu'un enfant sait de son parent : son rôle, et son axe à chaque breakpoint. */
interface Parent {
  readonly role: Role;
  readonly dirAt: (bp: string) => Dir;
}

interface Context {
  readonly path: string;
  readonly bp: string;
  readonly isRoot: boolean;
  /** Axe principal du parent, absent à la racine. */
  readonly main: Axis | undefined;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VAR = /^var\(--([A-Za-z0-9_-]+)\)$/;
const PX = /^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)px$/i;
const CLAMP = /^calc\((\d+) \* (?:\d+(?:\.\d+)?)em\)$/;
const MIN_CLAMP = /^min\((.+), (calc\(.+\))\)$/;
const RATIO = /^(\d+) \/ (\d+)$/;
const BORDER = /^(var\(--[A-Za-z0-9_-]+\)) solid (var\(--[A-Za-z0-9_-]+\))$/;
const SLOT_SRC = /^([A-Za-z_$][A-Za-z0-9_$]*)\.src$/;
/** `[\s\S]` : un label peut contenir U+2028, que `.` ne couvre pas. */
const SLOT_ALT = /^([A-Za-z_$][A-Za-z0-9_$]*)\.alt \?\? ("[\s\S]*")$/;

const HUG: Size = { kind: "hug" };
const FILL: Size = { kind: "fill" };
const NONE: Token<"space"> = { group: "space", path: ["none"] };

/** Lecture d'un dictionnaire avec mémoire de ce qui a été lu, pour signaler le reste. */
class Reader<V> {
  private readonly used = new Set<string>();
  constructor(private readonly entries: ReadonlyMap<string, V>) {}
  /** Rend la valeur une seule fois : une deuxième lecture de la même clé est absente. */
  take(key: string): V | undefined {
    if (this.used.has(key)) return undefined;
    this.used.add(key);
    return this.entries.get(key);
  }
  rest(): readonly string[] {
    return [...this.entries.keys()].filter((k) => !this.used.has(k));
  }
}

class Decompiler {
  private readonly errors: IRError[] = [];
  private readonly ids = new Set<string>();
  private readonly breakpoints: readonly Breakpoint[];
  private readonly iconsByWeb: ReadonlyMap<string, string>;

  constructor(
    private readonly css: CssModule,
    ds: DesignSystem,
    private readonly index: ReadonlyMap<string, TokenEntry>,
  ) {
    this.breakpoints = [...ds.breakpoints]
      .filter(([name]) => name !== BASE_BREAKPOINT)
      .map(([name, min]) => ({ name, min }));
    const byWeb = new Map<string, string>();
    for (const [name, backends] of ds.icons) {
      const web = backends["web"];
      if (web !== undefined) byWeb.set(web, name);
    }
    this.iconsByWeb = byWeb;
  }

  private readonly reported = new Set<string>();

  /**
   * Un diagnostic par cause et par nœud : la base est décodée avant les
   * breakpoints, une même déclaration fautive n'est donc signalée qu'une fois,
   * à l'endroit où elle apparaît d'abord (`where` nomme le breakpoint sinon).
   */
  private report(
    code: "E002" | "E003" | "E005",
    path: string,
    message: string,
    where = "",
  ): void {
    const key = `${code}|${path}|${message}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.errors.push(
      irError(code, path, `${message}${where} (décompilateur CSS)`),
    );
  }

  run(name: string, root: Element): Result<Normalized> {
    for (const min of this.css.media.keys()) {
      if (!this.breakpoints.some((b) => b.min === min))
        this.report(
          "E002",
          "",
          `@media (min-width: ${String(min)}px) ne correspond à aucun breakpoint du design system (seuils connus : ${this.breakpoints.map((b) => `${b.name} = ${String(b.min)}`).join(", ")})`,
        );
    }
    const tree = this.node(root, undefined, "");
    for (const id of this.css.rules.keys()) {
      if (!this.ids.has(id))
        this.report("E003", id, `règle .${id} sans élément data-ir="${id}"`);
    }
    for (const [min, rules] of this.css.media) {
      for (const id of rules.keys()) {
        if (!this.ids.has(id))
          this.report(
            "E003",
            id,
            `règle .${id} dans @media (min-width: ${String(min)}px) sans élément data-ir="${id}"`,
          );
      }
    }
    if (this.errors.length > 0 || tree === undefined) return fail(this.errors);
    return ok(normalize({ name, root: tree }));
  }

  // -- nœud -------------------------------------------------------------------

  private node(
    el: Element,
    parent: Parent | undefined,
    parentPath: string,
  ): Node | undefined {
    const attrs = new Reader(el.attrs);
    const idAttr = attrs.take("data-ir");
    if (idAttr?.kind !== "string") {
      this.report(
        "E003",
        parentPath,
        `élément <${el.tag}> ligne ${String(el.line)} sans data-ir="…"`,
      );
      return undefined;
    }
    const id = idAttr.value;
    const path = parentPath === "" ? id : `${parentPath}/${id}`;
    const bad = (message: string): void => this.report("E003", path, message);
    if (this.ids.has(id)) this.report("E005", path, `data-ir="${id}" dupliqué`);
    this.ids.add(id);

    const cls = attrs.take("className");
    if (cls?.kind !== "expr" || cls.text !== classAccess(id))
      bad(`className={${classAccess(id)}} attendu sur data-ir="${id}"`);
    const base = this.css.rules.get(id);
    if (base === undefined) {
      bad(`aucune règle .${id} dans le module CSS`);
      return undefined;
    }
    const type = typeOf(el.tag, base);
    if (type === undefined) {
      bad(`balise <${el.tag}> inattendue`);
      return undefined;
    }

    // Ce qui ne dépend pas du breakpoint : rôle, label, contenu, icône.
    const role = this.role(el, type, attrs, parent, path);
    const fixed = this.fixedProps(el, type, attrs, path);
    const rest = attrs.rest();
    if (rest.length > 0) bad(`attributs inattendus : ${rest.join(", ")}`);

    // Propriétés résolues à chaque breakpoint, puis surcharges par différence.
    const propsAt = new Map<string, Props>();
    const decode = (bp: string, decls: Declarations): Props =>
      this.decode(type, decls, {
        path,
        bp,
        isRoot: parent === undefined,
        main:
          parent === undefined
            ? undefined
            : parent.dirAt(bp) === "h"
              ? "w"
              : "h",
      });
    const baseProps = decode(BASE_BREAKPOINT, base);
    propsAt.set(BASE_BREAKPOINT, baseProps);
    const overrides: GenericOverride[] = [];
    for (const b of this.breakpoints) {
      const block = this.css.media.get(b.min)?.get(id);
      const props = decode(
        b.name,
        block === undefined ? base : overlay(base, block),
      );
      propsAt.set(b.name, props);
      const diff: Record<string, unknown> = {};
      for (const spec of PROP_SPECS[type]) {
        if (!spec.overridable) continue;
        const value = props[spec.key];
        if (deepEqual(value, baseProps[spec.key])) continue;
        if (value === undefined) {
          bad(
            `@${b.name} retire ${spec.key}, qu'une surcharge ne peut pas retirer (§4.7)`,
          );
          continue;
        }
        diff[spec.key] = value;
      }
      if (Object.keys(diff).length > 0)
        overrides.push({ breakpoint: b.name, props: diff });
    }

    let children: Node[] = [];
    if (type === "Stack") {
      const info: Parent = {
        role,
        dirAt: (bp) => (propsAt.get(bp)?.["dir"] === "h" ? "h" : "v"),
      };
      children = el.children.flatMap((child) => {
        const n = this.node(child, info, path);
        return n === undefined ? [] : [n];
      });
    } else if (el.children.length > 0) {
      bad(`<${el.tag}> n'a pas d'enfants`);
    }

    const props: Props = {
      ...baseProps,
      ...fixed.props,
      role,
      ...(fixed.label === undefined ? {} : { label: fixed.label }),
    };
    return withProps(
      skeleton(type, id, fixed.content, children),
      props,
      overrides,
    );
  }

  /** Rôle du nœud : balise `<hn>`, attribut `role`, `aria-level`, `aria-hidden`. */
  private role(
    el: Element,
    type: NodeType,
    attrs: Reader<JsxValue>,
    parent: Parent | undefined,
    path: string,
  ): Role {
    const bad = (message: string): void => this.report("E003", path, message);
    const roleAttr = this.string(attrs.take("role"), path, "role");
    const level = this.string(attrs.take("aria-level"), path, "aria-level");
    const hidden = this.string(attrs.take("aria-hidden"), path, "aria-hidden");
    let role: Role = { kind: "none" };
    const heading = /^h([1-6])$/.exec(el.tag);
    if (heading !== null) role = { kind: "heading", level: Number(heading[1]) };
    if (roleAttr !== undefined) {
      if (role.kind !== "none") bad(`role="${roleAttr}" sur un <${el.tag}>`);
      const simple = {
        button: "button",
        textbox: "textfield",
        list: "list",
        listitem: "listitem",
        img: "image",
      } as const;
      const kind = (
        simple as Readonly<Record<string, Role["kind"] | undefined>>
      )[roleAttr];
      if (kind !== undefined && kind !== "heading") {
        role = { kind };
      } else if (roleAttr === "heading") {
        const n = level === undefined ? Number.NaN : Number(level);
        if (!Number.isInteger(n) || n < 1 || n > 6)
          bad(`role="heading" requiert aria-level="1" à "6"`);
        else role = { kind: "heading", level: n };
      } else {
        bad(`role="${roleAttr}" inconnu`);
      }
    } else if (level !== undefined) {
      bad(`aria-level sans role="heading"`);
    }
    if (hidden !== undefined) {
      if (hidden !== "true") bad(`aria-hidden="${hidden}" inattendu`);
      if (role.kind !== "none") bad("aria-hidden avec un rôle");
      role = { kind: "decorative" };
    }
    if (type === "Text") {
      const expected =
        role.kind === "heading"
          ? `h${String(role.level)}`
          : parent?.role.kind === "button"
            ? "span"
            : "p";
      if (el.tag !== expected)
        bad(`<${expected}> attendu pour ce Text, trouvé <${el.tag}>`);
    }
    return role;
  }

  /** Contenu, label et nom d'icône : lus sur l'élément, identiques à tous les breakpoints. */
  private fixedProps(
    el: Element,
    type: NodeType,
    attrs: Reader<JsxValue>,
    path: string,
  ): {
    readonly content: Content | undefined;
    readonly label: string | undefined;
    readonly props: Props;
  } {
    const bad = (message: string): void => this.report("E003", path, message);
    let content: Content | undefined;
    let label: string | undefined;
    const props: Record<string, unknown> = {};

    if (type === "Image") {
      const src = attrs.take("src");
      const alt = attrs.take("alt");
      if (src === undefined || alt === undefined) {
        bad("src et alt requis sur <img>");
      } else if (src.kind === "string" || src.text.startsWith('"')) {
        const value = this.string(src, path, "src");
        if (value !== undefined) content = { kind: "literal", value };
        label = this.string(alt, path, "alt");
      } else {
        const name = SLOT_SRC.exec(src.text)?.[1];
        const fallback = alt.kind === "expr" ? SLOT_ALT.exec(alt.text) : null;
        if (name === undefined) {
          bad(`src={${src.text}} inattendu : nom.src attendu`);
        } else if (fallback === null || fallback[1] !== name) {
          bad(`alt={${name}.alt ?? "…"} attendu`);
        } else {
          content = { kind: "slot", name };
          label = this.json(fallback[2] ?? "", path, "alt");
        }
      }
    } else {
      const aria = attrs.take("aria-label");
      if (aria !== undefined) label = this.string(aria, path, "aria-label");
    }

    if (type === "Text") {
      const c = el.content;
      if (c === undefined) bad("contenu attendu sur un Text");
      else if (c.kind === "string")
        content = { kind: "literal", value: c.value };
      else if (c.text.startsWith('"')) {
        const value = this.json(c.text, path, "contenu");
        if (value !== undefined) content = { kind: "literal", value };
      } else if (IDENT.test(c.text)) content = { kind: "slot", name: c.text };
      else bad(`contenu {${c.text}} inattendu : {nom} ou {"…"} attendu`);
    } else if (el.content !== undefined) {
      bad(`<${el.tag}> n'a pas de contenu`);
    }

    if (type === "Icon") {
      const name = this.string(attrs.take("name"), path, "name");
      if (name === undefined) {
        bad(`name="…" requis sur <Icon>`);
      } else {
        const icon = this.iconsByWeb.get(name);
        if (icon === undefined)
          this.report(
            "E002",
            path,
            `Icône web « ${name} » inconnue d'icons.json (noms web déclarés : ${[...this.iconsByWeb.keys()].join(", ")})`,
          );
        else props["name"] = { group: "icon", path: icon.split(".") };
      }
    }

    return {
      content,
      label: label === undefined || label === "" ? undefined : label,
      props,
    };
  }

  /** Attribut `"…"` ou `{"…"}` → chaîne ; absent → absent. */
  private string(
    v: JsxValue | undefined,
    path: string,
    what: string,
  ): string | undefined {
    if (v === undefined) return undefined;
    if (v.kind === "string") return v.value;
    return this.json(v.text, path, what);
  }

  private json(text: string, path: string, what: string): string | undefined {
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value === "string") return value;
    } catch {
      // signalé ci-dessous
    }
    this.report("E003", path, `${what}={${text}} : chaîne JSON attendue`);
    return undefined;
  }

  // -- déclarations → propriétés résolues --------------------------------------

  /**
   * Inverse de la table §11.1 sur les déclarations effectives d'un breakpoint.
   * Rend les propriétés résolues, défauts compris ; la forme normale retirera
   * les défauts. Toute déclaration non lue est E003.
   */
  private decode(type: NodeType, decls: Declarations, ctx: Context): Props {
    const r = new Reader(decls);
    const bad = (message: string): void =>
      this.report("E003", ctx.path, message, whereOf(ctx));
    const out: Record<string, unknown> = {};
    const set = (key: string, value: unknown): void => {
      if (value !== undefined) out[key] = value;
    };

    if (type === "Stack" && r.take("display") !== "flex")
      bad("display: flex attendu sur un Stack");

    // Dimensions (§11.1 : racine, axe principal, axe secondaire).
    if (type === "Icon") {
      const w = r.take("width");
      const h = r.take("height");
      const size =
        w === undefined ? undefined : this.token(w, "size", ctx, "width");
      const size2 =
        h === undefined ? undefined : this.token(h, "size", ctx, "height");
      if (w === undefined || h === undefined)
        bad("width et height requis sur une Icon");
      else if (
        size !== undefined &&
        size2 !== undefined &&
        !deepEqual(size, size2)
      )
        bad("width et height d'une Icon diffèrent");
      set("size", size);
      if (ctx.main !== undefined && r.take("flex-shrink") !== "0")
        bad("flex-shrink: 0 attendu sur une Icon dans l'axe principal");
    } else {
      for (const axis of ["w", "h"] as const) {
        const prop = axis === "w" ? "width" : "height";
        const v = r.take(prop);
        let size: Size = HUG;
        if (ctx.isRoot) {
          if (v === undefined) bad(`${prop} requis sur la racine`);
          else if (v === "100%") size = FILL;
          else if (v === "fit-content") size = HUG;
          else size = this.fixed(v, ctx, prop);
        } else if (axis === ctx.main) {
          if (v !== undefined) {
            size = this.fixed(v, ctx, prop);
            if (r.take("flex-shrink") !== "0")
              bad(`flex-shrink: 0 attendu avec ${prop} sur l'axe principal`);
          } else {
            const flex = r.take("flex");
            if (flex === "0 0 auto") {
              size = HUG;
            } else if (flex === "1 1 0") {
              size = FILL;
              const minProp = axis === "w" ? "min-width" : "min-height";
              const min = r.take(minProp);
              if (min === undefined)
                bad(`${minProp} attendu après flex: 1 1 0`);
              else if (min !== "0")
                set(
                  axis === "w" ? "minW" : "minH",
                  this.length(min, ctx, minProp),
                );
            } else {
              bad(
                flex === undefined
                  ? `ni ${prop} ni flex sur l'axe principal`
                  : `flex: ${flex} inattendu`,
              );
            }
          }
        } else if (v !== undefined) {
          size = this.fixed(v, ctx, prop);
        } else {
          const self = r.take("align-self");
          if (self === "stretch") size = FILL;
          else if (self !== undefined) bad(`align-self: ${self} inattendu`);
        }
        out[axis] = size;
      }
      for (const [key, prop] of [
        ["minW", "min-width"],
        ["maxW", "max-width"],
        ["minH", "min-height"],
        ["maxH", "max-height"],
      ] as const) {
        if (out[key] !== undefined) continue;
        if (key === "maxH" && type === "Text") continue; // lu avec maxLines
        const v = r.take(prop);
        if (v === undefined) continue;
        if (v === "0") bad(`${prop}: 0 sans unité hors d'un fill`);
        else set(key, this.length(v, ctx, prop));
      }
    }

    if (type === "Stack") {
      const dir = r.take("flex-direction");
      if (dir === "column") out["dir"] = "v";
      else if (dir === "row") out["dir"] = "h";
      else bad(`flex-direction: ${dir ?? "absent"} inattendu`);
      const pad = r.take("padding");
      out["pad"] = pad === undefined ? NONE : this.pad(pad, ctx);
      const gap = r.take("gap");
      out["gap"] =
        gap === undefined ? NONE : this.token(gap, "space", ctx, "gap");
      const justify = r.take("justify-content");
      const mainAlign = {
        center: "center",
        "flex-end": "end",
        "space-between": "between",
      } as const;
      if (justify === undefined) out["mainAlign"] = "start";
      else if (justify in mainAlign)
        out["mainAlign"] = mainAlign[justify as keyof typeof mainAlign];
      else bad(`justify-content: ${justify} inattendu`);
      const items = r.take("align-items");
      const crossAlign = {
        "flex-start": "start",
        center: "center",
        "flex-end": "end",
        stretch: "stretch",
      } as const;
      if (items !== undefined && items in crossAlign)
        out["crossAlign"] = crossAlign[items as keyof typeof crossAlign];
      else bad(`align-items: ${items ?? "absent"} inattendu`);
      const overflow = r.take("overflow");
      const x = r.take("overflow-x");
      const y = r.take("overflow-y");
      if (overflow !== undefined) {
        if (overflow !== "hidden" || x !== undefined || y !== undefined)
          bad("overflow: hidden seul attendu pour clip");
        out["overflow"] = "clip";
      } else if (x !== undefined || y !== undefined) {
        const axis = x !== undefined ? "h" : "v";
        if ((x !== undefined && y !== undefined) || (x ?? y) !== "auto")
          bad("overflow-x: auto ou overflow-y: auto seul attendu pour scroll");
        else if (axis !== out["dir"])
          bad(
            `overflow-${axis === "h" ? "x" : "y"}: auto sur l'axe secondaire`,
          );
        out["overflow"] = "scroll";
      } else {
        out["overflow"] = "visible";
      }
    }

    if (type === "Stack" || type === "Box") {
      const bg = r.take("background");
      if (bg !== undefined)
        set("bg", this.token(bg, "color", ctx, "background"));
      const radius = r.take("border-radius");
      if (radius !== undefined)
        set("radius", this.token(radius, "radius", ctx, "border-radius"));
      const border = r.take("border");
      if (border !== undefined) {
        const m = BORDER.exec(border);
        if (m === null || m[1] === undefined || m[2] === undefined) {
          bad(
            `border: ${border} inattendu : var(--size-…) solid var(--color-…) attendu`,
          );
        } else {
          const w = this.token(m[1], "size", ctx, "border");
          const c = this.token(m[2], "color", ctx, "border");
          if (w !== undefined && c !== undefined) out["border"] = [w, c];
        }
      }
      const shadow = r.take("box-shadow");
      if (shadow !== undefined)
        set("shadow", this.token(shadow, "shadow", ctx, "box-shadow"));
      const opacity = r.take("opacity");
      if (opacity !== undefined)
        set("opacity", this.token(opacity, "opacity", ctx, "opacity"));
    }

    if (type === "Text") {
      const composes = r.take("composes");
      const m =
        composes === undefined ? null : /^(\S+) from global$/.exec(composes);
      if (m === null || m[1] === undefined)
        bad(
          `composes: ${composes ?? "absent"} inattendu : « type-x from global » attendu`,
        );
      else set("style", this.named(m[1], "type", ctx, "composes"));
      const color = r.take("color");
      if (color === undefined) bad("color requis sur un Text");
      else set("color", this.token(color, "color", ctx, "color"));
      const align = r.take("text-align");
      if (align === undefined) out["align"] = "start";
      else if (align === "center" || align === "end") out["align"] = align;
      else bad(`text-align: ${align} inattendu`);
      this.clamp(r, out, ctx, bad);
    }

    if (type === "Image") {
      const fit = r.take("object-fit");
      if (fit === undefined) out["fit"] = "cover";
      else if (fit === "contain") out["fit"] = "contain";
      else bad(`object-fit: ${fit} inattendu`);
      const ratio = r.take("aspect-ratio");
      if (ratio !== undefined) {
        const m = RATIO.exec(ratio);
        if (m === null)
          bad(`aspect-ratio: ${ratio} inattendu : « w / h » attendu`);
        else out["ratio"] = [Number(m[1]), Number(m[2])];
      }
      const radius = r.take("border-radius");
      if (radius !== undefined)
        set("radius", this.token(radius, "radius", ctx, "border-radius"));
    }

    if (type === "Icon") {
      const color = r.take("color");
      if (color === undefined) bad("color requis sur une Icon");
      else set("color", this.token(color, "color", ctx, "color"));
    }

    const rest = r.rest();
    if (rest.length > 0) bad(`déclarations inattendues : ${rest.join(", ")}`);
    return out;
  }

  /** `maxLines`, `truncate` et `maxH` d'un Text (§11.1 : line-clamp, ou max-height en calc / min). */
  private clamp(
    r: Reader<string>,
    out: Record<string, unknown>,
    ctx: Context,
    bad: (message: string) => void,
  ): void {
    const display = r.take("display");
    if (display !== undefined) {
      if (display !== "-webkit-box")
        bad(`display: ${display} inattendu sur un Text`);
      const lines = r.take("-webkit-line-clamp");
      const n = lines === undefined ? Number.NaN : Number(lines);
      if (!/^\d+$/.test(lines ?? "") || n < 1)
        bad(`-webkit-line-clamp: ${lines ?? "absent"} inattendu`);
      else {
        out["maxLines"] = n;
        out["truncate"] = "end";
      }
      if (r.take("-webkit-box-orient") !== "vertical")
        bad("-webkit-box-orient: vertical attendu avec le line-clamp");
      if (r.take("overflow") !== "hidden")
        bad("overflow: hidden attendu avec le line-clamp");
      const maxH = r.take("max-height");
      if (maxH !== undefined) {
        if (maxH === "0") bad("max-height: 0 sans unité");
        else this.setLength(out, "maxH", maxH, ctx, "max-height");
      }
      return;
    }
    const overflow = r.take("overflow");
    const maxH = r.take("max-height");
    if (overflow === undefined) {
      if (maxH === undefined) return;
      if (CLAMP.test(maxH) || MIN_CLAMP.test(maxH))
        bad("overflow: hidden attendu avec un max-height en calc()");
      else if (maxH === "0") bad("max-height: 0 sans unité");
      else this.setLength(out, "maxH", maxH, ctx, "max-height");
      return;
    }
    if (overflow !== "hidden")
      bad(`overflow: ${overflow} inattendu sur un Text`);
    const min = maxH === undefined ? null : MIN_CLAMP.exec(maxH);
    const clampText = min === null ? maxH : min[2];
    const lines = clampText === undefined ? null : CLAMP.exec(clampText);
    if (lines === null || lines[1] === undefined) {
      bad(
        `max-height: calc(n * Lem) attendu avec overflow: hidden, trouvé ${maxH ?? "rien"}`,
      );
      return;
    }
    out["maxLines"] = Number(lines[1]);
    out["truncate"] = "none";
    if (min !== null && min[1] !== undefined)
      this.setLength(out, "maxH", min[1], ctx, "max-height");
  }

  private setLength(
    out: Record<string, unknown>,
    key: string,
    value: string,
    ctx: Context,
    prop: string,
  ): void {
    const n = this.length(value, ctx, prop);
    if (n !== undefined) out[key] = n;
  }

  // -- valeurs ----------------------------------------------------------------

  private fixed(value: string, ctx: Context, prop: string): Size {
    const n = this.length(value, ctx, prop);
    return n === undefined ? HUG : { kind: "fixed", value: n };
  }

  private length(
    value: string,
    ctx: Context,
    prop: string,
  ): Length | undefined {
    const m = PX.exec(value);
    if (m !== null && m[1] !== undefined) return Number(m[1]);
    if (value.startsWith("var(")) return this.token(value, "size", ctx, prop);
    this.report(
      "E003",
      ctx.path,
      `${prop}: ${value} n'est ni une longueur en px ni var(--size-…)`,
      whereOf(ctx),
    );
    return undefined;
  }

  private pad(value: string, ctx: Context): Pad | undefined {
    const parts = value.split(" ");
    const tokens = parts.map((p) => this.token(p, "space", ctx, "padding"));
    if (tokens.some((t) => t === undefined)) return undefined;
    const ok = tokens as Token<"space">[];
    const [a, b, c, d] = ok;
    if (ok.length === 1 && a !== undefined) return a;
    if (ok.length === 2 && a !== undefined && b !== undefined) return [a, b];
    if (
      ok.length === 4 &&
      a !== undefined &&
      b !== undefined &&
      c !== undefined &&
      d !== undefined
    )
      return [a, b, c, d];
    this.report(
      "E003",
      ctx.path,
      `padding: ${value} : une, deux ou quatre valeurs attendues`,
    );
    return undefined;
  }

  private token<G extends TokenGroup>(
    value: string,
    group: G,
    ctx: Context,
    prop: string,
  ): Token<G> | undefined {
    const m = VAR.exec(value);
    if (m === null || m[1] === undefined) {
      this.report("E003", ctx.path, `${prop}: ${value} n'est pas var(--…)`);
      return undefined;
    }
    return this.named(m[1], group, ctx, prop);
  }

  /** Nom CSS (`space-md`, `type-heading-lg`) → token du groupe attendu. */
  private named<G extends TokenGroup>(
    name: string,
    group: G,
    ctx: Context,
    prop: string,
  ): Token<G> | undefined {
    const entry = this.index.get(name);
    if (entry === undefined) {
      this.report(
        "E002",
        ctx.path,
        `${prop} : « ${name} » ne nomme aucun token référençable du design system`,
      );
      return undefined;
    }
    if (entry.path[0] !== group) {
      this.report(
        "E003",
        ctx.path,
        `${prop} : $${entry.path.join(".")} est du groupe ${entry.path[0] ?? ""}, ${group} attendu`,
      );
      return undefined;
    }
    return { group, path: entry.path.slice(1) };
  }
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

/** Suffixe des diagnostics émis hors de la base. */
const whereOf = (ctx: Context): string =>
  ctx.bp === BASE_BREAKPOINT ? "" : ` (@${ctx.bp})`;

/** Type du nœud d'après sa balise ; un `<div>` est un Stack s'il est en flex, une Box sinon. */
function typeOf(tag: string, base: Declarations): NodeType | undefined {
  if (tag === "div") return base.get("display") === "flex" ? "Stack" : "Box";
  if (tag === "p" || tag === "span" || /^h[1-6]$/.test(tag)) return "Text";
  if (tag === "img") return "Image";
  if (tag === "Icon") return "Icon";
  return undefined;
}

/** Nœud typé dont `withProps` remplace les propriétés ; les valeurs ci-dessous ne survivent pas. */
function skeleton(
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
