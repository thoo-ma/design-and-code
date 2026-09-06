/**
 * Analyse lexicale d'un fichier `.ir` (spec §3.1, lexique).
 *
 * Un token `$a.b.c`, un `#id` et un `@bp` sont chacun un seul lexème : la
 * grammaire n'admet pas d'espace à l'intérieur.
 */

import { fail, irError, ok } from "./errors.js";
import type { Position, Result } from "./errors.js";

export type Punct = "{" | "}" | "(" | ")" | "," | ":";

export type Lexeme =
  | { readonly kind: "ident"; readonly value: string; readonly pos: Position }
  | { readonly kind: "number"; readonly value: number; readonly pos: Position }
  | { readonly kind: "string"; readonly value: string; readonly pos: Position }
  | {
      readonly kind: "token";
      /** `[groupe, ...chemin]`, au moins deux segments. */
      readonly segments: readonly string[];
      readonly pos: Position;
    }
  | { readonly kind: "id"; readonly value: string; readonly pos: Position }
  | { readonly kind: "at"; readonly value: string; readonly pos: Position }
  | { readonly kind: "punct"; readonly value: Punct; readonly pos: Position }
  | { readonly kind: "eof"; readonly pos: Position };

const IDENT = /[A-Za-z_][A-Za-z0-9_-]*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const PUNCT: readonly Punct[] = ["{", "}", "(", ")", ",", ":"];

function isPunct(c: string): c is Punct {
  return (PUNCT as readonly string[]).includes(c);
}

/** Découpe `source` en lexèmes, terminés par `eof`. Échoue avec E009. */
export function lex(source: string): Result<readonly Lexeme[]> {
  const out: Lexeme[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const here = (): Position => ({ line, column });
  const advance = (n: number): void => {
    for (let k = 0; k < n; k++) {
      if (source.charAt(i) === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
      i++;
    }
  };
  const matchAt = (re: RegExp, at: number): string | undefined => {
    re.lastIndex = at;
    const m = re.exec(source);
    return m === null ? undefined : m[0];
  };
  const syntax = (message: string, pos: Position): Result<readonly Lexeme[]> =>
    fail([irError("E009", "", message, pos)]);

  while (i < source.length) {
    const c = source.charAt(i);
    const pos = here();

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance(1);
      continue;
    }

    if (isPunct(c)) {
      out.push({ kind: "punct", value: c, pos });
      advance(1);
      continue;
    }

    if (c === "$") {
      const group = matchAt(IDENT, i + 1);
      if (group === undefined) {
        return syntax(
          "Token mal formé : `$` doit être suivi de `groupe.nom`.",
          pos,
        );
      }
      const segments = [group];
      let j = i + 1 + group.length;
      while (source.charAt(j) === ".") {
        const seg = matchAt(IDENT, j + 1);
        if (seg === undefined) {
          return syntax("Token mal formé : un segment vide après `.`.", pos);
        }
        segments.push(seg);
        j += 1 + seg.length;
      }
      if (segments.length < 2) {
        return syntax(
          `Token mal formé : \`$${group}\` doit être suivi d'au moins un segment, comme \`$${group}.nom\`.`,
          pos,
        );
      }
      out.push({ kind: "token", segments, pos });
      advance(j - i);
      continue;
    }

    if (c === "#" || c === "@") {
      const name = matchAt(IDENT, i + 1);
      if (name === undefined) {
        return syntax(
          c === "#"
            ? "Identifiant mal formé : `#` doit être suivi d'un nom."
            : "Surcharge mal formée : `@` doit être suivi d'un nom de breakpoint.",
          pos,
        );
      }
      out.push({ kind: c === "#" ? "id" : "at", value: name, pos });
      advance(1 + name.length);
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      for (;;) {
        const d = source.charAt(j);
        if (d === "" || d === "\n") {
          return syntax(
            "Chaîne non terminée : guillemet fermant manquant sur cette ligne.",
            pos,
          );
        }
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === '"') break;
        j++;
      }
      const text = source.slice(i, j + 1);
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return syntax(
          'Chaîne invalide : utiliser les échappements JSON (\\", \\\\, \\n, \\uXXXX).',
          pos,
        );
      }
      if (typeof value !== "string") {
        return syntax("Chaîne invalide.", pos);
      }
      out.push({ kind: "string", value, pos });
      advance(j + 1 - i);
      continue;
    }

    const num = matchAt(NUMBER, i);
    if (num !== undefined) {
      out.push({ kind: "number", value: Number(num), pos });
      advance(num.length);
      continue;
    }

    const id = matchAt(IDENT, i);
    if (id !== undefined) {
      out.push({ kind: "ident", value: id, pos });
      advance(id.length);
      continue;
    }

    return syntax(`Caractère inattendu « ${c} ».`, pos);
  }

  out.push({ kind: "eof", pos: here() });
  return ok(out);
}
