/**
 * Police de test aux métriques connues (spec §8.3).
 *
 * Chaque glyphe avance exactement `0,6 em`, la valeur de `CHAR_WIDTH_RATIO` de
 * la mesure de référence (§5.3). Avec `letter-spacing` du token, la largeur
 * d'un caractère dans le navigateur vaut donc `0,6 × fontSize + letterSpacing`,
 * et une ligne de n caractères `n ×` cette largeur : le navigateur et
 * `monospaceMeasure` mesurent le même texte de la même façon, ce qu'exige la
 * loi 3 (« à mesure fixée », §5.3).
 *
 * La police est construite ici, pas commitée : un binaire ne se relit pas.
 */

import opentype from "opentype.js";
import type { Path } from "opentype.js";

import { CHAR_WIDTH_RATIO } from "ir-layout-ref";

export const TEST_FONT_FAMILY = "IRTest";

const UNITS_PER_EM = 1000;
const ADVANCE = UNITS_PER_EM * CHAR_WIDTH_RATIO;

/**
 * Caractères couverts : ASCII imprimable et les lettres accentuées du
 * français. Un caractère absent tomberait sur une police de repli, aux
 * métriques inconnues ; le corpus de la loi 3 s'y limite donc (§8.3).
 */
export const ALPHABET: readonly string[] = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
    String.fromCharCode(0x20 + i),
  ),
  ...Array.from("àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ«»°—’…€"),
];

const ALPHABET_SET = new Set(ALPHABET);

/** Le caractère est-il couvert par la police de test ? */
export const covered = (char: string): boolean => ALPHABET_SET.has(char);

/** Rectangle plein, pour que le texte soit visible sur une capture d'écran. */
function box(): Path {
  const path = new opentype.Path();
  path.moveTo(40, 0);
  path.lineTo(ADVANCE - 40, 0);
  path.lineTo(ADVANCE - 40, 700);
  path.lineTo(40, 700);
  path.close();
  return path;
}

let cached: string | undefined;

/** La police de test, en base64, pour une `@font-face` en `data:`. */
export function testFontBase64(): string {
  if (cached !== undefined) return cached;
  const glyphs = [
    new opentype.Glyph({
      name: ".notdef",
      unicode: 0,
      advanceWidth: ADVANCE,
      path: new opentype.Path(),
    }),
    ...ALPHABET.map(
      (char) =>
        new opentype.Glyph({
          name: `u${char.codePointAt(0)?.toString(16) ?? "0"}`,
          unicode: char.codePointAt(0) ?? 0,
          advanceWidth: ADVANCE,
          path: char === " " ? new opentype.Path() : box(),
        }),
    ),
  ];
  const font = new opentype.Font({
    familyName: TEST_FONT_FAMILY,
    styleName: "Regular",
    unitsPerEm: UNITS_PER_EM,
    ascender: 800,
    descender: -200,
    glyphs,
  });
  cached = Buffer.from(font.toArrayBuffer()).toString("base64");
  return cached;
}
