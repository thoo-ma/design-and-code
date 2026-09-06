/**
 * Mesure de texte déterministe de référence (spec §5.3) : police monospace
 * fictive, largeur de caractère `0,6 × fontSize + letterSpacing`, hauteur de
 * ligne `fontSize × lineHeight`, repli aux espaces, un mot plus long que la
 * largeur disponible occupe sa ligne et déborde, les espaces en fin de ligne
 * débordent au lieu de provoquer un repli, au plus `maxLines` lignes, texte
 * vide de hauteur nulle.
 */

import type { TextMeasure, TextSize, Typography } from "./types.js";

export const CHAR_WIDTH_RATIO = 0.6;

export function charWidth(style: Typography): number {
  return style.fontSize * CHAR_WIDTH_RATIO + style.letterSpacing;
}

export function lineHeight(style: Typography): number {
  return style.fontSize * style.lineHeight;
}

/** Longueurs (en caractères) des lignes après repli, sans troncature. */
export function wrapLines(
  text: string,
  style: Typography,
  availableWidth: number,
): number[] {
  if (text.length === 0) return [];
  const cw = charWidth(style);
  const maxChars =
    Number.isFinite(availableWidth) && cw > 0
      ? Math.floor(availableWidth / cw + 1e-9)
      : Infinity;
  const lines: number[] = [];
  for (const paragraph of text.split("\n")) {
    // Un mot ne descend à la ligne que s'il ne tient pas ; les espaces qui le
    // précèdent restent sur la ligne précédente, où ils débordent (§5.3).
    let line = 0;
    let spaces = 0;
    for (const part of paragraph.match(/ +|[^ ]+/g) ?? []) {
      const length = Array.from(part).length;
      if (part.startsWith(" ")) {
        spaces += length;
        continue;
      }
      if (line > 0 && line + spaces + length > maxChars) {
        lines.push(line);
        line = length;
      } else {
        line += spaces + length;
      }
      spaces = 0;
    }
    lines.push(line + spaces);
  }
  return lines;
}

export const monospaceMeasure: TextMeasure = (
  text,
  style,
  availableWidth,
  maxLines,
): TextSize => {
  const lines = wrapLines(text, style, availableWidth);
  const shown = maxLines === undefined ? lines : lines.slice(0, maxLines);
  if (shown.length === 0) return { w: 0, h: 0 };
  return {
    w: Math.max(...shown) * charWidth(style),
    h: shown.length * lineHeight(style),
  };
};
