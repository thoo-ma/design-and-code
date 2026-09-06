/**
 * Résolution des breakpoints (spec §4.7, §5.2) : quel breakpoint est actif
 * pour une largeur de viewport, et l'arbre « à plat » pour ce breakpoint,
 * base recouverte par la surcharge et plus aucune surcharge.
 */

import type { Node, Screen } from "./ast.js";
import { BASE_BREAKPOINT } from "./design-system.js";
import type { DesignSystem } from "./design-system.js";
import { propsOf, withProps } from "./props-view.js";

/** Le breakpoint de plus grand seuil inférieur ou égal à `width`, sinon la base. */
export function activeBreakpoint(ds: DesignSystem, width: number): string {
  let best = BASE_BREAKPOINT;
  let bestMin = Number.NEGATIVE_INFINITY;
  for (const [name, min] of ds.breakpoints) {
    if (min <= width && min > bestMin) {
      best = name;
      bestMin = min;
    }
  }
  return best;
}

/** Applique la surcharge de `breakpoint` à chaque nœud et retire toutes les surcharges. */
export function resolveBreakpoint(screen: Screen, breakpoint: string): Screen {
  const visit = (node: Node): Node => {
    const override = node.overrides.find((o) => o.breakpoint === breakpoint);
    const props =
      override === undefined
        ? propsOf(node.props)
        : { ...propsOf(node.props), ...propsOf(override.props) };
    const flat = withProps(node, props, []);
    return flat.type === "Stack"
      ? { ...flat, children: flat.children.map(visit) }
      : flat;
  };
  return { ...screen, root: visit(screen.root) };
}
