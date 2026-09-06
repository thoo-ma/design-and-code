/**
 * Vue générique des propriétés d'un nœud : un dictionnaire en lecture seule,
 * et la reconstruction du nœud typé. Partagée par la forme normale et la
 * résolution des breakpoints.
 *
 * Les transformations qui passent par cette vue ne font que retirer une clé,
 * réordonner les clés, fusionner une surcharge dans la base, ou remplacer une
 * valeur par une valeur du même type ; la conversion retour est donc sûre.
 */

import type {
  BoxProps,
  IconProps,
  ImageProps,
  Node,
  Overridable,
  Override,
  StackProps,
  TextProps,
} from "./ast.js";

export type Props = Readonly<Record<string, unknown>>;

export interface GenericOverride {
  readonly breakpoint: string;
  readonly props: Props;
}

/** Un objet de propriétés est un dictionnaire : lecture seule, jamais muté. */
export const propsOf = (p: object): Props => p as Props;

export const overridesOf = (node: Node): readonly GenericOverride[] =>
  node.overrides.map((o) => ({
    breakpoint: o.breakpoint,
    props: propsOf(o.props),
  }));

/** Reconstruit un nœud typé à partir de la vue générique (voir l'en-tête). */
export function withProps(
  node: Node,
  props: Props,
  overrides: readonly GenericOverride[],
): Node {
  const typed = <P>(): { props: P; overrides: readonly Override<P>[] } => ({
    props: props as unknown as P,
    overrides: overrides.map((o) => ({
      breakpoint: o.breakpoint,
      props: o.props as unknown as Overridable<P>,
    })),
  });
  switch (node.type) {
    case "Stack":
      return { ...node, ...typed<StackProps>() };
    case "Box":
      return { ...node, ...typed<BoxProps>() };
    case "Text":
      return { ...node, ...typed<TextProps>() };
    case "Image":
      return { ...node, ...typed<ImageProps>() };
    case "Icon":
      return { ...node, ...typed<IconProps>() };
  }
}
