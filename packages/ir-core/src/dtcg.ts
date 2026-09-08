/**
 * Lecture des valeurs DTCG communes aux compilateurs de tokens CSS et SwiftUI.
 *
 * `isObject` et `rgb255` étaient dupliquées à l'identique dans
 * `ir-backend-css/src/tokens.ts` et `ir-backend-swiftui/src/tokens.ts` : deux
 * lectures DTCG qui pouvaient diverger. Elles vivent ici, avec
 * `TokenCompilerOptions`, pour que les deux cibles lisent la même chose.
 * Fonctions pures, aucune I/O.
 */

export type Json = Readonly<Record<string, unknown>>;

export const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Composantes RVB 0-255 d'une valeur de couleur DTCG (`components: [r, g, b]`,
 * flottants 0..1). `undefined` si la valeur n'est pas une couleur lisible.
 */
export function rgb255(
  value: unknown,
): readonly [number, number, number] | undefined {
  if (!isObject(value)) return undefined;
  const c = value["components"];
  if (!Array.isArray(c) || c.length < 3) return undefined;
  const [r, g, b] = c;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number")
    return undefined;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Options communes des compilateurs de tokens. */
export interface TokenCompilerOptions {
  /** Noms des fichiers sources, pour l'en-tête. */
  readonly sources: readonly string[];
}
