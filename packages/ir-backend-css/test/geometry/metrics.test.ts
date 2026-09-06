import { fixtureDesignSystem } from "ir-core/testing";
import { lookupToken } from "ir-core";
import { CHAR_WIDTH_RATIO, monospaceMeasure } from "ir-layout-ref";
import type { Typography } from "ir-layout-ref";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_FONT_FAMILY, testFontBase64 } from "./font.js";
import { launchBrowser } from "./harness.js";

/**
 * Le navigateur mesure-t-il le texte comme `monospaceMeasure` (§5.3) ?
 *
 * C'est l'hypothèse de la loi 3 : « à mesure fixée ». La police de test donne
 * à chaque glyphe une avance de 0,6 em exactement, mais un navigateur qui
 * arrondit les avances au pixel entier — ce que fait le rendu hinté du
 * *headless shell* — mesure autre chose, et toute la loi glisse. Ce test le
 * dit franchement, avant que le corpus n'échoue sur un écart de 1 u.
 */
const STYLE: Typography = {
  fontFamily: [TEST_FONT_FAMILY],
  fontSize: 28,
  lineHeight: 1.214,
  fontWeight: 600,
  letterSpacing: -0.4,
};

const TEXTS = ["aaaaa", "     ", "aaaa ", "aaa a", "iiiiiiiiii"];

/** Le token dont `STYLE` reprend les métriques, pour que le test suive la fixture. */
const HEADING_LG = lookupToken(fixtureDesignSystem, {
  group: "type",
  path: ["heading", "lg"],
});

const page = (texts: readonly string[]): string => {
  const css = `@font-face { font-family: "${TEST_FONT_FAMILY}"; src: url(data:font/ttf;base64,${testFontBase64()}) format("truetype"); }
* { margin: 0; padding: 0; box-sizing: border-box; font-synthesis: none; }
.t { font-family: "${TEST_FONT_FAMILY}"; font-size: ${String(STYLE.fontSize)}px; line-height: ${String(STYLE.lineHeight)}; font-weight: ${String(STYLE.fontWeight)}; letter-spacing: ${String(STYLE.letterSpacing)}px; white-space: pre-wrap; width: max-content; }`;
  return `<style>${css}</style>${texts.map((t, i) => `<div class="t" id="t${String(i)}">${t}</div>`).join("")}`;
};

const widths = async (browser: Browser): Promise<number[]> => {
  const p = await browser.newPage();
  await p.setViewportSize({ width: 600, height: 400 });
  await p.setContent(page(TEXTS));
  return p.evaluate(
    (n: number) =>
      document.fonts.ready.then(() =>
        Array.from(
          { length: n },
          (_, i) =>
            document.getElementById(`t${String(i)}`)?.getBoundingClientRect()
              .width ?? -1,
        ),
      ),
    TEXTS.length,
  );
};

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
});

describe("mesure du texte (spec §5.3, §8.3)", () => {
  it("la police de test avance de 0,6 em, comme le dit CHAR_WIDTH_RATIO", () => {
    expect(CHAR_WIDTH_RATIO).toBe(0.6);
    expect(HEADING_LG?.type).toBe("typography");
  });

  it("le navigateur mesure comme monospaceMeasure, à 1/64 de pixel près", async () => {
    const measured = await widths(browser);
    const expected = TEXTS.map(
      (t) => monospaceMeasure(t, STYLE, Number.POSITIVE_INFINITY, undefined).w,
    );
    const diff = measured.map((w, i) => w - (expected[i] ?? 0));
    // Le navigateur arrondit la boîte au 1/64 de pixel supérieur.
    expect(
      diff.every((d) => d >= -1e-6 && d <= 1 / 64 + 1e-6),
      `mesures ${JSON.stringify(measured)}, attendu ${JSON.stringify(expected)} ; écarts ${JSON.stringify(diff)}. Un écart proportionnel au nombre de caractères veut dire que le navigateur arrondit les avances : il faut le Chromium complet, pas le headless shell.`,
    ).toBe(true);
  });
});
