import type { DesignSystem } from "ir-core";

/** Rectangle dans le repère de l'écran, origine en haut à gauche, sans arrondi. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Géométrie : un rectangle par identifiant de nœud (spec §5.2). */
export type Geometry = ReadonlyMap<string, Rect>;

/** Token de typographie résolu (`$type.*`), en unités u. */
export interface Typography {
  readonly fontFamily: readonly string[];
  readonly fontSize: number;
  /** Multiplicateur de la taille de police. */
  readonly lineHeight: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
}

export interface TextSize {
  readonly w: number;
  readonly h: number;
}

/** `platform.measureText` (spec §5.3) : `availableWidth` peut être ∞. */
export type TextMeasure = (
  text: string,
  style: Typography,
  availableWidth: number,
  maxLines: number | undefined,
) => TextSize;

export interface Platform {
  readonly measureText: TextMeasure;
}

export interface Viewport {
  readonly w: number;
  readonly h: number;
}

export interface LayoutOptions {
  readonly viewport: Viewport;
  readonly designSystem: DesignSystem;
  readonly platform: Platform;
  /** Valeurs d'exemple des slots (spec §5.3) ; un slot absent vaut la chaîne vide. */
  readonly slots?: Readonly<Record<string, string>>;
}
