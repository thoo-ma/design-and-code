/**
 * Typecheck contre le design system (spec §12, T4).
 *
 * Vérifie que chaque token cité existe, est référençable et a le type DTCG
 * attendu par son groupe (E002) ; que chaque breakpoint surchargé existe
 * (E002) ; que chaque `Image` a ses deux axes résolvables à chaque
 * breakpoint (E006) ; qu'aucun enfant `fill` ne soit sur l'axe de défilement
 * d'un Stack `scroll` (E007, ADR-008). Pur ; les positions viennent de `parse`.
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
  /** Slots déjà vus : nom → type de nœud (§9.3, un slot est un paramètre). */
  const slots = new Map<string, Node["type"]>();
  const visit = (
    node: Node,
    indices: readonly number[],
    parentPath: string,
  ): void => {
    const segment =
      node.id ?? `${node.type}[${String(indices[indices.length - 1] ?? 0)}]`;
    const path = parentPath === "" ? segment : `${parentPath}/${segment}`;
    const pos = positions?.get(indexPath(indices));
    const report = (
      code: "E002" | "E004" | "E006" | "E007",
      message: string,
    ): void => {
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

    if (
      (node.type === "Text" || node.type === "Image") &&
      node.content.kind === "slot"
    ) {
      const seen = slots.get(node.content.name);
      if (seen === undefined) slots.set(node.content.name, node.type);
      else if (seen !== node.type) {
        report(
          "E004",
          `slot(${node.content.name}) est déjà un slot de ${seen} : un slot est un paramètre, ses usages doivent avoir le même type (§9.3). Le renommer.`,
        );
      }
    }

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
      // E007 statique (ADR-008) : enfant fill sur l'axe de défilement d'un Stack scroll.
      for (const bp of ["", ...node.overrides.map((o) => o.breakpoint)]) {
        const own = node.overrides.find((o) => o.breakpoint === bp);
        const eff =
          own === undefined ? node.props : { ...node.props, ...own.props };
        if (eff.overflow !== "scroll") continue;
        const main = eff.dir === "h" ? "w" : "h";
        node.children.forEach((child, k) => {
          if (child.type === "Icon") return;
          const childOverride = child.overrides.find(
            (o) => o.breakpoint === bp,
          );
          const childEff =
            childOverride === undefined
              ? child.props
              : { ...child.props, ...childOverride.props };
          if (childEff[main]?.kind !== "fill") return;
          const segment = child.id ?? `${child.type}[${String(k)}]`;
          errors.push(
            irError(
              "E007",
              `${path}/${segment}`,
              `${main}: fill sur l'axe de défilement de son parent scroll${bp === "" ? "" : ` (@${bp})`} (ADR-008) : mettre fixed ou hug, ou retirer scroll du parent.`,
              positions?.get(indexPath([...indices, k])),
            ),
          );
        });
      }
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
