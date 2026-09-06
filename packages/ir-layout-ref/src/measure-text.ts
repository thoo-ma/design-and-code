/**
 * Mesure de texte déterministe de référence (spec §5.3) : police monospace
 * fictive, largeur de caractère `0,6 × fontSize + letterSpacing`, hauteur de
 * ligne `fontSize × lineHeight`, repli aux espaces, un mot plus long que la
 * largeur disponible occupe sa ligne et déborde, au plus `maxLines` lignes,
 * texte vide de hauteur nulle.
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
    const words = paragraph.split(" ").map((w) => Array.from(w).length);
    let current = -1;
    for (const w of words) {
      const candidate = current < 0 ? w : current + 1 + w;
      if (current < 0 || candidate <= maxChars) {
        current = candidate;
      } else {
        lines.push(current);
        current = w;
      }
    }
    lines.push(Math.max(0, current));
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
