import { it } from "vitest";

import { TEST_FONT_FAMILY, testFontBase64 } from "./font.js";
import { launchBrowser } from "./harness.js";

/**
 * Sonde temporaire : mesure quelques textes dans le navigateur qui exécute ce
 * test, pour comparer les métriques d'ici et celles de la CI. À retirer.
 */
const TEXTS = ["aaaaa", "     ", "aaaa ", " aaaa", "aaa a"];
const MODES = ["pre-wrap", "break-spaces", "normal", "pre"];

it("sonde : largeurs intrinsèques selon white-space", async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 400, height: 400 });
  const css = `@font-face { font-family: "${TEST_FONT_FAMILY}"; src: url(data:font/ttf;base64,${testFontBase64()}) format("truetype"); }
* { margin: 0; padding: 0; box-sizing: border-box; font-synthesis: none; }
.t { font-family: "${TEST_FONT_FAMILY}"; font-size: 28px; line-height: 1.214; letter-spacing: -0.4px; width: max-content; }
.w { width: 60px; }`;
  const body = MODES.flatMap((mode, m) =>
    TEXTS.map(
      (text, i) =>
        `<div class="t" id="m${String(m)}t${String(i)}" style="white-space: ${mode}">${text}</div>` +
        `<div class="t w" id="w${String(m)}t${String(i)}" style="white-space: ${mode}">${text}</div>`,
    ),
  ).join("");
  await page.setContent(`<style>${css}</style>${body}`);
  const measures = await page.evaluate(
    ([modes, texts]: [string[], string[]]) => {
      const out: string[] = [];
      modes.forEach((mode, m) => {
        texts.forEach((text, i) => {
          const hug = document
            .getElementById(`m${String(m)}t${String(i)}`)
            ?.getBoundingClientRect();
          const fixed = document
            .getElementById(`w${String(m)}t${String(i)}`)
            ?.getBoundingClientRect();
          out.push(
            `${mode} ${JSON.stringify(text)} hug=${String(hug?.width)} h=${String(hug?.height)} | 60px h=${String(fixed?.height)}`,
          );
        });
      });
      return out;
    },
    [MODES, TEXTS] as [string[], string[]],
  );
  await browser.close();
  // La sonde échoue exprès : c'est le seul canal qui remonte dans les logs.
  throw new Error(`SONDE (5 caractères = 82 attendu)\n${measures.join("\n")}`);
}, 120_000);
