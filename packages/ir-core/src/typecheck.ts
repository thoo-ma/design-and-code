/**
 * Typecheck contre le design system (spec §12, T4).
 *
 * Vérifie que chaque token cité existe, est référençable et a le type DTCG
 * attendu par son groupe (E002) ; que chaque breakpoint surchargé existe
 * (E002) ; que chaque `Image` a ses deux axes résolvables à chaque
 * breakpoint (E006). Pur ; les positions viennent de la table de `parse`.
 */

import { TOKEN_GROUPS } from "./ast.js";
import type { Node, Screen, Size, Token, TokenGroup } from "./ast.js";
import { EXPECTED_TYPE, lookupToken, tokenKey } from "./design-system.js";
import type { DesignSystem } from "./design-system.js";
import { irError } from "./errors.js";
import type { IRError, Position } from "./errors.js";
import { indexPath } from "./parser.js";

export function typecheck(
  screen: Screen,
  ds: DesignSystem,
  positions?: ReadonlyMap<string, Position>,
): readonly IRError[] {
  const errors: IRError[] = [];
  const visit = (
    node: Node,
    indices: readonly number[],
    parentPath: string,
  ): void => {
    const segment =
      node.id ?? `${node.type}[${String(indices[indices.length - 1] ?? 0)}]`;
    const path = parentPath === "" ? segment : `${parentPath}/${segment}`;
    const pos = positions?.get(indexPath(indices));
    const report = (code: "E002" | "E006", message: string): void => {
      errors.push(irError(code, path, message, pos));
    };

    const seen = new Set<string>();
    const checkToken = (token: Token): void => {
      const key = tokenKey(token);
      if (seen.has(key)) return;
      seen.add(key);
      if (token.group === "icon") {
        const name = token.path.join(".");
        if (!ds.icons.has(name)) {
          report(
            "E002",
            `Icône $icon.${name} inconnue. Icônes déclarées : ${[...ds.icons.keys()].join(", ")}.`,
          );
        }
        return;
      }
      const entry = lookupToken(ds, token);
      if (entry === undefined) {
        report(
          "E002",
          `Token $${key} inconnu dans le design system. Vérifier le nom ou l'ajouter au design system.`,
        );
      } else if (!entry.referenceable) {
        report(
          "E002",
          `Token $${key} non référençable : c'est une primitive. Utiliser un token sémantique qui y fait référence.`,
        );
      } else if (entry.type !== EXPECTED_TYPE[token.group]) {
        report(
          "E002",
          `Token $${key} de type DTCG « ${entry.type} » ; le groupe $${token.group} attend « ${EXPECTED_TYPE[token.group]} ».`,
        );
      }
    };

    collectTokens(node.props, checkToken);
    for (const o of node.overrides) {
      collectTokens(o.props, checkToken);
      if (!ds.breakpoints.has(o.breakpoint)) {
        report(
          "E002",
          `Breakpoint @${o.breakpoint} inconnu. Breakpoints déclarés : ${[...ds.breakpoints.keys()].join(", ")}.`,
        );
      }
    }

    if (node.type === "Image") {
      for (const bp of ["", ...node.overrides.map((o) => o.breakpoint)]) {
        const override = node.overrides.find((o) => o.breakpoint === bp);
        const eff =
          override === undefined
            ? node.props
            : { ...node.props, ...override.props };
        const w = eff.w ?? { kind: "hug" };
        const h = eff.h ?? { kind: "hug" };
        const hasRatio = eff.ratio !== undefined;
        const unresolved = (["w", "h"] as const).filter((axis) => {
          const own = axis === "w" ? w : h;
          const other = axis === "w" ? h : w;
          return !(resolvable(own) || (hasRatio && resolvable(other)));
        });
        if (unresolved.length > 0) {
          const where = bp === "" ? "à la base" : `à @${bp}`;
          report(
            "E006",
            `Image sans dimension résolvable sur ${unresolved.join(" et ")} ${where} : donner fixed ou fill, ou ratio avec l'autre axe fixed ou fill.`,
          );
        }
      }
    }

    if (node.type === "Stack") {
      node.children.forEach((child, k) => {
        visit(child, [...indices, k], path);
      });
    }
  };
  visit(screen.root, [], "");
  return errors;
}

const resolvable = (s: Size): boolean =>
  s.kind === "fixed" || s.kind === "fill";

function isToken(v: unknown): v is Token {
  return (
    typeof v === "object" &&
    v !== null &&
    "group" in v &&
    "path" in v &&
    (TOKEN_GROUPS as readonly string[]).includes(String(v.group)) &&
    Array.isArray(v.path)
  );
}

/** Parcourt une valeur de propriétés et appelle `f` sur chaque token rencontré. */
function collectTokens(value: unknown, f: (token: Token) => void): void {
  if (isToken(value)) {
    f(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectTokens(v, f);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) collectTokens(v, f);
  }
}

export type { TokenGroup };
