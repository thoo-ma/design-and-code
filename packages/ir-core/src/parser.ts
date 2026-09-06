/**
 * Parseur descendant récursif de la grammaire spec §3.1.
 *
 * `parse` rend l'AST et une table de positions (ligne, colonne) par nœud,
 * indexée par chemin d'indices depuis la racine (`"/"` pour la racine,
 * `"/0/2"` pour le troisième enfant du premier enfant). La table survit à la
 * forme normale, qui ne réordonne ni ne supprime aucun nœud.
 *
 * Erreurs : E009 (syntaxe) arrête l'analyse ; E001, E004 et E005 sont
 * collectées, dans l'ordre du document, et l'analyse continue pour en
 * rapporter plusieurs à la fois.
 */

import { NODE_TYPES } from "./ast.js";
import type { Content, Node, NodeType, Screen } from "./ast.js";
import { fail, irError, ok } from "./errors.js";
import type { IRError, Position, Result } from "./errors.js";
import { lex } from "./lexer.js";
import type { Lexeme, Punct } from "./lexer.js";
import { PROP_SPECS } from "./props.js";
import type { PropSpec } from "./props.js";
import {
  BoxOverridableSchema,
  BoxPropsSchema,
  IconOverridableSchema,
  IconPropsSchema,
  ImageOverridableSchema,
  ImagePropsSchema,
  StackOverridableSchema,
  StackPropsSchema,
  TextOverridableSchema,
  TextPropsSchema,
} from "./schema.js";
import type { RawValue } from "./values.js";
import type { z } from "zod";

export interface Parsed {
  readonly screen: Screen;
  /** Position du lexème TYPE de chaque nœud, par chemin d'indices. */
  readonly positions: ReadonlyMap<string, Position>;
}

/** Le breakpoint de base ne se surcharge pas (spec §4.7). */
const BASE_BREAKPOINT = "compact";

/** Clé de la table des positions : `"/"` pour la racine, puis `"/0/1"`. */
export function indexPath(indices: readonly number[]): string {
  return "/" + indices.join("/");
}

/** Chemin lisible d'un nœud pour les diagnostics : ids séparés par `/`. */
function joinPath(parent: string, segment: string): string {
  return parent === "" ? segment : `${parent}/${segment}`;
}

function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

interface RawProp {
  readonly key: string;
  readonly value: RawValue;
  readonly pos: Position;
}

interface RawOverride {
  readonly breakpoint: string;
  readonly props: readonly RawProp[];
  readonly pos: Position;
}

/** En-tête d'un nœud une fois ses propriétés converties, avant ses enfants. */
interface Header {
  readonly type: NodeType;
  readonly id: string | undefined;
  readonly pos: Position;
  readonly path: string;
  readonly props: Record<string, unknown>;
  readonly content: Content | undefined;
  readonly overrides: readonly {
    readonly breakpoint: string;
    readonly props: Record<string, unknown>;
  }[];
}

/** Interne : déroule la pile sur une erreur de syntaxe. Jamais exporté. */
class SyntaxAbort {
  constructor(readonly error: IRError) {}
}

export function parse(source: string): Result<Parsed> {
  const lexed = lex(source);
  if (!lexed.ok) return fail(lexed.errors);
  const parser = new Parser(lexed.value);
  try {
    return parser.document();
  } catch (e) {
    if (e instanceof SyntaxAbort) return fail([...parser.errors, e.error]);
    throw e;
  }
}

class Parser {
  private i = 0;
  private readonly eof: Lexeme;
  readonly errors: IRError[] = [];
  readonly positions = new Map<string, Position>();

  constructor(private readonly lexemes: readonly Lexeme[]) {
    this.eof = lexemes[lexemes.length - 1] ?? {
      kind: "eof",
      pos: { line: 1, column: 1 },
    };
  }

  // -- flux de lexèmes ------------------------------------------------------

  private peek(): Lexeme {
    return this.lexemes[this.i] ?? this.eof;
  }

  private next(): Lexeme {
    const l = this.peek();
    if (l.kind !== "eof") this.i++;
    return l;
  }

  private isPunct(p: Punct): boolean {
    const l = this.peek();
    return l.kind === "punct" && l.value === p;
  }

  private describe(l: Lexeme): string {
    switch (l.kind) {
      case "ident":
        return `« ${l.value} »`;
      case "number":
        return `le nombre ${String(l.value)}`;
      case "string":
        return `la chaîne ${JSON.stringify(l.value)}`;
      case "token":
        return `le token $${l.segments.join(".")}`;
      case "id":
        return `#${l.value}`;
      case "at":
        return `@${l.value}`;
      case "punct":
        return `« ${l.value} »`;
      case "eof":
        return "la fin du fichier";
    }
  }

  private abort(message: string, pos: Position, path: string): never {
    throw new SyntaxAbort(irError("E009", path, message, pos));
  }

  private error(
    code: "E001" | "E004" | "E005",
    path: string,
    message: string,
    pos: Position,
  ): void {
    this.errors.push(irError(code, path, message, pos));
  }

  private expectPunct(p: Punct, path: string): Lexeme {
    const l = this.next();
    if (l.kind !== "punct" || l.value !== p) {
      this.abort(`« ${p} » attendu, trouvé ${this.describe(l)}.`, l.pos, path);
    }
    return l;
  }

  private expectIdent(
    what: string,
    path: string,
  ): { readonly value: string; readonly pos: Position } {
    const l = this.next();
    if (l.kind !== "ident") {
      this.abort(`${what} attendu, trouvé ${this.describe(l)}.`, l.pos, path);
    }
    return { value: l.value, pos: l.pos };
  }

  // -- grammaire ------------------------------------------------------------

  document(): Result<Parsed> {
    const keyword = this.expectIdent("Le mot-clé « screen »", "");
    if (keyword.value !== "screen") {
      this.abort(
        `Le mot-clé « screen » attendu, trouvé « ${keyword.value} ».`,
        keyword.pos,
        "",
      );
    }
    const name = this.expectIdent("Le nom de l'écran", "");
    this.expectPunct("{", "");
    if (this.isPunct("}")) {
      this.abort(
        "Un écran contient exactement un nœud racine ; aucun trouvé.",
        this.peek().pos,
        "",
      );
    }
    const root = this.node([], "");
    const after = this.peek();
    if (after.kind === "ident" && isNodeType(after.value)) {
      this.abort(
        "Un écran contient exactement un nœud racine ; un second nœud commence ici. Envelopper les deux dans un Stack.",
        after.pos,
        "",
      );
    }
    this.expectPunct("}", "");
    const trailing = this.peek();
    if (trailing.kind !== "eof") {
      this.abort(
        `Fin de fichier attendue après « } », trouvé ${this.describe(trailing)}.`,
        trailing.pos,
        "",
      );
    }
    if (root !== undefined) this.checkUniqueIds(root);
    if (root === undefined || this.errors.length > 0) return fail(this.errors);
    return ok({
      screen: { name: name.value, root },
      positions: this.positions,
    });
  }

  private node(
    indices: readonly number[],
    parentPath: string,
  ): Node | undefined {
    const typeLexeme = this.expectIdent(
      "Un type de nœud (Stack, Box, Text, Image, Icon)",
      parentPath,
    );
    if (!isNodeType(typeLexeme.value)) {
      this.abort(
        `Type de nœud inconnu « ${typeLexeme.value} ». Attendu Stack, Box, Text, Image ou Icon.`,
        typeLexeme.pos,
        parentPath,
      );
    }
    const type = typeLexeme.value;
    const pos = typeLexeme.pos;

    let id: string | undefined;
    const idLexeme = this.peek();
    if (idLexeme.kind === "id") {
      this.next();
      id = idLexeme.value;
    }
    const index = indices[indices.length - 1] ?? 0;
    const path = joinPath(parentPath, id ?? `${type}[${String(index)}]`);
    this.positions.set(indexPath(indices), pos);

    this.expectPunct("(", path);
    const props = this.isPunct(")") ? [] : this.props(path);
    this.expectPunct(")", path);

    let content:
      { readonly value: Content; readonly pos: Position } | undefined;
    const c = this.peek();
    if (c.kind === "string") {
      this.next();
      content = { value: { kind: "literal", value: c.value }, pos: c.pos };
    } else if (c.kind === "ident" && c.value === "slot") {
      this.next();
      this.expectPunct("(", path);
      const slot = this.expectIdent("Le nom du slot", path);
      if (slot.value.includes("-")) {
        this.error(
          "E004",
          path,
          `Le nom de slot « ${slot.value} » contient un tiret : un slot devient un paramètre dans chaque cible (spec §9.3). N'utiliser que des lettres, des chiffres et _.`,
          slot.pos,
        );
      }
      this.expectPunct(")", path);
      content = { value: { kind: "slot", name: slot.value }, pos: c.pos };
    }

    const overrides: RawOverride[] = [];
    for (;;) {
      const at = this.peek();
      if (at.kind !== "at") break;
      this.next();
      this.expectPunct("(", path);
      const overrideProps = this.isPunct(")") ? [] : this.props(path);
      this.expectPunct(")", path);
      if (at.value === BASE_BREAKPOINT) {
        this.error(
          "E004",
          path,
          `@${at.value} surcharge le breakpoint de base : ses propriétés sont celles de base (spec §4.7). Les y déplacer.`,
          at.pos,
        );
        continue;
      }
      overrides.push({
        breakpoint: at.value,
        props: overrideProps,
        pos: at.pos,
      });
    }

    // L'en-tête est typé avant le bloc : les erreurs sortent dans l'ordre du
    // document, et une erreur de syntaxe dans un enfant ne les masque pas.
    const header = this.header(type, id, pos, path, props, content, overrides);

    let children: Node[] | undefined;
    if (this.isPunct("{")) {
      const blockPos = this.next().pos;
      if (type !== "Stack") {
        this.error(
          "E004",
          path,
          `${type} n'a pas d'enfants : le bloc { } est réservé à Stack.`,
          blockPos,
        );
      }
      children = [];
      let k = 0;
      while (!this.isPunct("}")) {
        if (this.peek().kind === "eof") {
          this.abort(
            `« } » attendu pour fermer le bloc de ${path}, trouvé la fin du fichier.`,
            this.peek().pos,
            path,
          );
        }
        const child = this.node([...indices, k], path);
        if (child !== undefined) children.push(child);
        k++;
      }
      this.expectPunct("}", path);
      if (type !== "Stack") return undefined;
    }

    return header === undefined
      ? undefined
      : this.assemble(header, children ?? []);
  }

  private props(path: string): RawProp[] {
    const out: RawProp[] = [];
    for (;;) {
      const key = this.expectIdent("Un nom de propriété", path);
      this.expectPunct(":", path);
      const value = this.value(path);
      out.push({ key: key.value, value, pos: key.pos });
      if (!this.isPunct(",")) return out;
      this.next();
    }
  }

  private value(path: string): RawValue {
    const l = this.next();
    switch (l.kind) {
      case "token":
        return { kind: "token", segments: l.segments, pos: l.pos };
      case "number":
        return { kind: "number", value: l.value, pos: l.pos };
      case "string":
        return { kind: "string", value: l.value, pos: l.pos };
      case "ident":
        if (this.isPunct("(")) {
          this.next();
          const args = this.values(path);
          this.expectPunct(")", path);
          return { kind: "call", name: l.value, args, pos: l.pos };
        }
        return { kind: "enum", name: l.value, pos: l.pos };
      case "punct":
        if (l.value === "(") {
          const items = this.values(path);
          this.expectPunct(")", path);
          return { kind: "tuple", items, pos: l.pos };
        }
        break;
      default:
        break;
    }
    return this.abort(
      `Une valeur attendue, trouvé ${this.describe(l)}.`,
      l.pos,
      path,
    );
  }

  private values(path: string): RawValue[] {
    const out = [this.value(path)];
    while (this.isPunct(",")) {
      this.next();
      out.push(this.value(path));
    }
    return out;
  }

  // -- typage ---------------------------------------------------------------

  /** Convertit une liste de propriétés ; `present` liste les clés vues, converties ou non. */
  private convertProps(
    raw: readonly RawProp[],
    specs: readonly PropSpec[],
    type: NodeType,
    path: string,
    inOverride: boolean,
  ): {
    readonly values: Record<string, unknown>;
    readonly present: ReadonlySet<string>;
  } {
    const values: Record<string, unknown> = {};
    const present = new Set<string>();
    for (const r of raw) {
      const spec = specs.find((s) => s.key === r.key);
      if (spec === undefined) {
        this.error(
          "E004",
          path,
          `Propriété inconnue « ${r.key} » sur ${type}. Propriétés admises : ${specs.map((s) => s.key).join(", ")}.`,
          r.pos,
        );
        continue;
      }
      if (inOverride && !spec.overridable) {
        this.error(
          "E004",
          path,
          `« ${r.key} » n'est pas surchargeable par breakpoint (spec §4.7). La sortir de la surcharge.`,
          r.pos,
        );
        continue;
      }
      if (present.has(r.key)) {
        this.error(
          "E004",
          path,
          `Propriété « ${r.key} » dupliquée. N'en garder qu'une.`,
          r.pos,
        );
        continue;
      }
      present.add(r.key);
      const converted = spec.conv(r.value);
      if (!converted.ok) {
        this.error(
          converted.code,
          path,
          `${r.key} : ${converted.message}`,
          converted.pos ?? r.value.pos,
        );
        continue;
      }
      values[r.key] = converted.value;
    }
    return { values, present };
  }

  private header(
    type: NodeType,
    id: string | undefined,
    pos: Position,
    path: string,
    rawProps: readonly RawProp[],
    content: { readonly value: Content; readonly pos: Position } | undefined,
    rawOverrides: readonly RawOverride[],
  ): Header | undefined {
    const before = this.errors.length;
    const specs = PROP_SPECS[type];
    const props = this.convertProps(rawProps, specs, type, path, false);

    for (const s of specs) {
      if (s.required && !props.present.has(s.key)) {
        this.error(
          "E004",
          path,
          `Propriété requise manquante : « ${s.key} » sur ${type}. L'ajouter.`,
          pos,
        );
      }
    }

    const takesContent = type === "Text" || type === "Image";
    if (takesContent && content === undefined) {
      this.error(
        "E004",
        path,
        `${type} requiert un contenu : une chaîne entre guillemets ou slot(nom).`,
        pos,
      );
    }
    if (!takesContent && content !== undefined) {
      this.error(
        "E004",
        path,
        `${type} n'a pas de contenu. Le retirer.`,
        content.pos,
      );
    }

    const overrides: Header["overrides"][number][] = [];
    const breakpoints = new Set<string>();
    for (const o of rawOverrides) {
      if (breakpoints.has(o.breakpoint)) {
        this.error(
          "E004",
          path,
          `Surcharge @${o.breakpoint} dupliquée sur ce nœud. Fusionner les deux.`,
          o.pos,
        );
        continue;
      }
      breakpoints.add(o.breakpoint);
      overrides.push({
        breakpoint: o.breakpoint,
        props: this.convertProps(o.props, specs, type, path, true).values,
      });
    }

    if (this.errors.length > before) return undefined;
    return {
      type,
      id,
      pos,
      path,
      props: props.values,
      content: content?.value,
      overrides,
    };
  }

  /** Filet de sécurité : les convertisseurs garantissent déjà la forme. */
  private typed<T>(
    schema: z.ZodType<T>,
    value: unknown,
    path: string,
    pos: Position,
  ): T | undefined {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    this.error(
      "E004",
      path,
      `Propriétés invalides : ${result.error.message}`,
      pos,
    );
    return undefined;
  }

  private assemble(h: Header, children: readonly Node[]): Node | undefined {
    const idPart = h.id === undefined ? {} : { id: h.id };
    const typedOverrides = <P>(
      schema: z.ZodType<P>,
    ):
      | readonly { readonly breakpoint: string; readonly props: P }[]
      | undefined => {
      const out: { breakpoint: string; props: P }[] = [];
      for (const o of h.overrides) {
        const typed = this.typed(schema, o.props, h.path, h.pos);
        if (typed === undefined) return undefined;
        out.push({ breakpoint: o.breakpoint, props: typed });
      }
      return out;
    };

    switch (h.type) {
      case "Stack": {
        const p = this.typed(StackPropsSchema, h.props, h.path, h.pos);
        const o = typedOverrides(StackOverridableSchema);
        if (p === undefined || o === undefined) return undefined;
        return { type: "Stack", ...idPart, props: p, overrides: o, children };
      }
      case "Box": {
        const p = this.typed(BoxPropsSchema, h.props, h.path, h.pos);
        const o = typedOverrides(BoxOverridableSchema);
        if (p === undefined || o === undefined) return undefined;
        return { type: "Box", ...idPart, props: p, overrides: o };
      }
      case "Text": {
        const p = this.typed(TextPropsSchema, h.props, h.path, h.pos);
        const o = typedOverrides(TextOverridableSchema);
        if (p === undefined || o === undefined || h.content === undefined)
          return undefined;
        return {
          type: "Text",
          ...idPart,
          props: p,
          overrides: o,
          content: h.content,
        };
      }
      case "Image": {
        const p = this.typed(ImagePropsSchema, h.props, h.path, h.pos);
        const o = typedOverrides(ImageOverridableSchema);
        if (p === undefined || o === undefined || h.content === undefined)
          return undefined;
        return {
          type: "Image",
          ...idPart,
          props: p,
          overrides: o,
          content: h.content,
        };
      }
      case "Icon": {
        const p = this.typed(IconPropsSchema, h.props, h.path, h.pos);
        const o = typedOverrides(IconOverridableSchema);
        if (p === undefined || o === undefined) return undefined;
        return { type: "Icon", ...idPart, props: p, overrides: o };
      }
    }
  }

  // -- contraintes globales -------------------------------------------------

  private checkUniqueIds(root: Node): void {
    const seen = new Map<string, string>();
    const visit = (
      node: Node,
      indices: readonly number[],
      parentPath: string,
    ): void => {
      const index = indices[indices.length - 1] ?? 0;
      const path = joinPath(
        parentPath,
        node.id ?? `${node.type}[${String(index)}]`,
      );
      if (node.id !== undefined) {
        const first = seen.get(node.id);
        if (first !== undefined) {
          const pos = this.positions.get(indexPath(indices)) ?? {
            line: 1,
            column: 1,
          };
          this.error(
            "E005",
            path,
            `Identifiant #${node.id} déjà utilisé par ${first}. Le renommer.`,
            pos,
          );
        } else {
          seen.set(node.id, path);
        }
      }
      if (node.type === "Stack") {
        node.children.forEach((child, k) => {
          visit(child, [...indices, k], path);
        });
      }
    };
    visit(root, [], "");
  }
}
