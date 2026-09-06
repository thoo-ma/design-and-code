/**
 * AST de l'IR v0.1.
 *
 * Transcription des §3 (grammaire) et §4 (modèle de boîtes) de
 * docs/spec-ir-v0.md. Ce fichier ne contient que des types et deux listes
 * de constantes qui en dérivent.
 *
 * Conventions :
 * - Une propriété absente vaut « valeur par défaut » (spec §6, règle 2).
 *   Les types n'encodent pas les défauts ; les consommateurs les appliquent.
 *   Avec `exactOptionalPropertyTypes`, absent et `undefined` sont distincts :
 *   seul « absent » existe dans l'AST.
 * - Les nœuds sont discriminés par `type` (le TYPE de la grammaire), les
 *   autres unions par `kind`.
 * - Les tuples de la grammaire (`pad`, `border`, `ratio`) sont des tableaux
 *   de longueur fixe.
 * - Tout est `readonly` : un AST est une valeur, jamais mutée en place.
 */

// ---------------------------------------------------------------------------
// Tokens (spec §2)
// ---------------------------------------------------------------------------

/** Les huit groupes de tokens que l'IR peut référencer (spec §2). */
export const TOKEN_GROUPS = [
  "space",
  "size",
  "color",
  "type",
  "radius",
  "shadow",
  "opacity",
  "icon",
] as const;

export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/**
 * Référence `$groupe.nom` vers le design system, typée par son groupe.
 * `$color.text.primary` → `{ group: "color", path: ["text", "primary"] }`.
 * L'existence du token est vérifiée au typecheck (E002), pas ici.
 */
export interface Token<G extends TokenGroup = TokenGroup> {
  readonly group: G;
  /** Segments après le groupe, au moins un (grammaire : `("." IDENT)+`). */
  readonly path: readonly string[];
}

export type SpaceToken = Token<"space">;
export type SizeToken = Token<"size">;
export type ColorToken = Token<"color">;
export type TypographyToken = Token<"type">;
export type RadiusToken = Token<"radius">;
export type ShadowToken = Token<"shadow">;
export type OpacityToken = Token<"opacity">;
export type IconToken = Token<"icon">;

// ---------------------------------------------------------------------------
// Valeurs (spec §4.1)
// ---------------------------------------------------------------------------

/** Mode de dimension par axe : `fixed(n)` | `hug` | `fill`. Défaut : `hug`. */
export type Size =
  | { readonly kind: "fixed"; readonly value: number }
  | { readonly kind: "hug" }
  | { readonly kind: "fill" };

/** Longueur pour `minW`/`maxW`/`minH`/`maxH` : littéral en u, ou `$size.*`. */
export type Length = number | SizeToken;

/** Sémantique du nœud. Défaut : `none`. */
export type Role =
  | { readonly kind: "none" }
  | { readonly kind: "heading"; readonly level: number }
  | { readonly kind: "button" }
  | { readonly kind: "textfield" }
  | { readonly kind: "list" }
  | { readonly kind: "listitem" }
  | { readonly kind: "image" }
  | { readonly kind: "decorative" };

/**
 * Contenu d'une feuille `Text` ou `Image` (spec §2, §3.1) : placeholder
 * fourni par le design, ou `slot(nom)` fourni par le code. C'est la frontière
 * de l'ADR-002 dans la syntaxe.
 */
export type Content =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "slot"; readonly name: string };

// ---------------------------------------------------------------------------
// Énumérations (spec §4.2, §4.4, §4.5)
// ---------------------------------------------------------------------------

export type Dir = "v" | "h";
export type MainAlign = "start" | "center" | "end" | "between";
export type CrossAlign = "start" | "center" | "end" | "stretch";
export type Overflow = "visible" | "clip" | "scroll";
export type TextAlign = "start" | "center" | "end";
export type Truncate = "none" | "end";
export type Fit = "cover" | "contain";

/** `pad: $space.*` | `($v, $h)` | `($t, $r, $b, $l)`. Défaut : `$space.none`. */
export type Pad =
  | SpaceToken
  | readonly [SpaceToken, SpaceToken]
  | readonly [SpaceToken, SpaceToken, SpaceToken, SpaceToken];

/** `border: ($size.*, $color.*)`. */
export type Border = readonly [SizeToken, ColorToken];

/** `ratio: (w, h)`, entiers. */
export type Ratio = readonly [number, number];

// ---------------------------------------------------------------------------
// Propriétés par type de nœud (spec §4)
// ---------------------------------------------------------------------------

/** Propriétés communes à tous les nœuds (spec §4.1). */
export interface CommonProps {
  readonly w?: Size;
  readonly h?: Size;
  readonly minW?: Length;
  readonly maxW?: Length;
  readonly minH?: Length;
  readonly maxH?: Length;
  readonly role?: Role;
  readonly label?: string;
}

/** Propriétés de style partagées par `Stack` et `Box` (spec §4.2, §4.3). */
export interface StyleProps {
  readonly bg?: ColorToken;
  readonly radius?: RadiusToken;
  readonly border?: Border;
  readonly shadow?: ShadowToken;
  readonly opacity?: OpacityToken;
}

/** Spec §4.2. */
export interface StackProps extends CommonProps, StyleProps {
  readonly dir: Dir;
  readonly gap?: SpaceToken;
  readonly pad?: Pad;
  readonly mainAlign?: MainAlign;
  readonly crossAlign?: CrossAlign;
  readonly overflow?: Overflow;
}

/** Spec §4.3 : le style de `Stack`, sans layout ni enfants. */
export type BoxProps = CommonProps & StyleProps;

/** Spec §4.4. */
export interface TextProps extends CommonProps {
  readonly style: TypographyToken;
  readonly color: ColorToken;
  readonly align?: TextAlign;
  /** Entier ≥ 1. Absent : illimité. */
  readonly maxLines?: number;
  /** Défaut : `end` si `maxLines`, sinon `none`. */
  readonly truncate?: Truncate;
}

/** Spec §4.5. */
export interface ImageProps extends CommonProps {
  readonly fit?: Fit;
  readonly ratio?: Ratio;
  readonly radius?: RadiusToken;
}

/**
 * Spec §4.6. `w`, `h` et les contraintes min/max valent implicitement
 * `fixed(size)` et ne sont pas exprimables ; `role` et `label` restent.
 */
export interface IconProps extends Pick<CommonProps, "role" | "label"> {
  readonly name: IconToken;
  readonly size: SizeToken;
  readonly color: ColorToken;
}

// ---------------------------------------------------------------------------
// Surcharges par breakpoint (spec §4.7)
// ---------------------------------------------------------------------------

/**
 * Propriétés surchargeables d'un nœud : layout et style. Jamais `role`,
 * `label`, le contenu ni les enfants.
 */
export type Overridable<P> = Partial<Omit<P, "role" | "label">>;

/** `@breakpoint(props)`. Le breakpoint doit exister dans le design system. */
export interface Override<P> {
  readonly breakpoint: string;
  readonly props: Overridable<P>;
}

// ---------------------------------------------------------------------------
// Nœuds (spec §2, §3.1)
// ---------------------------------------------------------------------------

/** Les cinq types de nœuds, dans l'ordre de la spec. */
export const NODE_TYPES = ["Stack", "Box", "Text", "Image", "Icon"] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** Forme commune : `TYPE id? (props) override*`. */
export interface NodeBase<T extends NodeType, P> {
  readonly type: T;
  /** `#id`. Optionnel à l'écriture ; la forme normale en assigne un (§6, règle 6). */
  readonly id?: string;
  readonly props: P;
  readonly overrides: readonly Override<P>[];
}

/** Conteneur à un axe, seul nœud avec des enfants. */
export interface StackNode extends NodeBase<"Stack", StackProps> {
  readonly children: readonly Node[];
}

/** Rectangle feuille avec style. Placeholder de composant et surface. */
export type BoxNode = NodeBase<"Box", BoxProps>;

/** Texte feuille. */
export interface TextNode extends NodeBase<"Text", TextProps> {
  readonly content: Content;
}

/** Image feuille. Le contenu est une URL ou un nom d'asset, ou un slot. */
export interface ImageNode extends NodeBase<"Image", ImageProps> {
  readonly content: Content;
}

/** Icône feuille, issue du jeu d'icônes du design system. */
export type IconNode = NodeBase<"Icon", IconProps>;

export type Node = StackNode | BoxNode | TextNode | ImageNode | IconNode;

// ---------------------------------------------------------------------------
// Document (spec §2, §3.1)
// ---------------------------------------------------------------------------

/**
 * `screen IDENT { node }`. Un fichier `.ir` décrit exactement un écran, qui
 * contient exactement un nœud racine (spec §3.1).
 */
export interface Screen {
  readonly name: string;
  readonly root: Node;
}
