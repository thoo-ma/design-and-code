/**
 * Harnais de la loi 3, côté CSS (spec §8.3) : monte le code généré dans
 * Chromium et lit la géométrie par `data-ir`.
 *
 * La page est exactement la sortie du compilateur, plus ce qu'un projet réel
 * fournit une fois : la feuille de tokens (T5), la réinitialisation
 * (`RESET_CSS`) et le fichier de support. Trois substitutions appartiennent au
 * harnais, pas au compilateur, et sont documentées en §8.3 :
 * - la famille de police des tokens devient la police de test aux métriques
 *   connues, celles de `monospaceMeasure` ;
 * - le `src` des images devient un PNG 1×1 transparent : l'asset n'est pas
 *   dans l'IR, la référence lui donne une taille intrinsèque nulle, et
 *   Chromium dessinerait sinon une icône d'image cassée aux dimensions
 *   inconnues. Aucun axe n'en dépend dans une IR bien typée (E006).
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { DesignSystem, Node, Screen, ThemedDesignSystem } from "ir-core";
import type { Geometry, Rect } from "ir-layout-ref";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";

import { compileCss, compileTokensCss } from "../../src/index.js";
import { RESET_CSS, SUPPORT_TSX } from "../../src/index.js";

import { TEST_FONT_FAMILY, testFontBase64 } from "./font.js";

/** PNG 1×1 transparent : voir l'en-tête. */
const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export interface Viewport {
  readonly w: number;
  readonly h: number;
}

const TMP = new URL("./.tmp/", import.meta.url);

/**
 * Ce que le harnais ajoute pour que le navigateur mesure comme la référence :
 * le point de montage fait exactement le viewport (c'est la contrainte que la
 * référence donne à la racine), la police de test n'a qu'une graisse (pas de
 * gras synthétique, plus large), et le modèle de référence ne connaît pas les
 * barres de défilement, qui amputeraient la boîte de contenu d'un Stack
 * `scroll` (§8.3).
 */
const HARNESS_CSS = `#ir-mount {
  width: 100%;
  height: 100%;
}

* {
  font-synthesis: none;
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  display: none;
}
`;

/**
 * Chromium local : `playwright install` dans la CI, ou le chemin donné par
 * `IR_CHROMIUM_PATH` quand l'environnement fournit déjà un binaire.
 */
export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env["IR_CHROMIUM_PATH"];
  return chromium.launch(
    executablePath === undefined ? {} : { executablePath },
  );
}

let counter = 0;

/**
 * Compile l'écran, écrit la zone générée, la rend avec React et bâtit la page.
 */
export async function pageOf(
  screen: Screen,
  ds: ThemedDesignSystem,
  slots: Readonly<Record<string, string>>,
): Promise<string> {
  const compiled = compileCss(screen, {
    designSystem: ds.light,
    samples: slots,
  });
  if (!compiled.ok)
    throw new Error(
      compiled.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  const out = compiled.value;
  const tokens = compileTokensCss(ds, { sources: ["tokens.json"] });
  if (!tokens.ok) throw new Error(JSON.stringify(tokens.errors));

  const dir = join(TMP.pathname, `s${String(counter++)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, out.files.tsx), out.tsx);
  writeFileSync(join(dir, out.files.css), out.css);
  writeFileSync(join(dir, "ir-support.tsx"), SUPPORT_TSX);
  const module: Readonly<Record<string, unknown>> = (await import(
    /* @vite-ignore */ pathToFileURL(join(dir, out.files.tsx)).href
  )) as Readonly<Record<string, unknown>>;
  const component = Object.values(module).find(
    (v) => typeof v === "function",
  ) as ComponentType<Record<string, unknown>> | undefined;
  if (component === undefined)
    throw new Error(`aucun composant exporté par ${out.files.tsx}`);

  const markup = renderToStaticMarkup(
    createElement(component, slotProps(screen, slots)),
  );
  const css = [
    `@font-face { font-family: "${TEST_FONT_FAMILY}"; src: url(data:font/ttf;base64,${testFontBase64()}) format("truetype"); }`,
    RESET_CSS,
    HARNESS_CSS,
    // La police du design system est remplacée par celle du test (§8.3).
    tokens.value.replace(
      /font-family: [^;]+;/g,
      `font-family: "${TEST_FONT_FAMILY}";`,
    ),
    out.css,
  ].join("\n");
  return `<!doctype html>\n<meta charset="utf-8">\n<style>\n${css}\n</style>\n<div id="ir-mount">${markup}</div>\n`;
}

/** Valeurs d'exemple : le texte pour un slot de Text, un PNG 1×1 pour une Image. */
function slotProps(
  screen: Screen,
  slots: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const visit = (node: Node): void => {
    if (node.type === "Stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type !== "Text" && node.type !== "Image") return;
    if (node.content.kind !== "slot") return;
    const name = node.content.name;
    props[name] =
      node.type === "Text"
        ? (slots[name] ?? name)
        : { src: BLANK_PNG, alt: node.props.label ?? "" };
  };
  visit(screen.root);
  return props;
}

/** Géométrie mesurée par le navigateur, dans le repère de la racine. */
export async function browserGeometry(
  page: Page,
  html: string,
  viewport: Viewport,
): Promise<Geometry> {
  await page.setViewportSize({ width: viewport.w, height: viewport.h });
  await page.setContent(html);
  const rects = await page.evaluate((blank: string) => {
    for (const img of document.querySelectorAll("img"))
      img.setAttribute("src", blank);
    return document.fonts.ready.then(() => {
      const mount = document.getElementById("ir-mount");
      const origin = mount?.getBoundingClientRect() ?? { x: 0, y: 0 };
      const out: Record<string, [number, number, number, number]> = {};
      for (const el of document.querySelectorAll("[data-ir]")) {
        const r = el.getBoundingClientRect();
        out[el.getAttribute("data-ir") ?? ""] = [
          r.x - origin.x,
          r.y - origin.y,
          r.width,
          r.height,
        ];
      }
      return out;
    });
  }, BLANK_PNG);
  return new Map(
    Object.entries(rects).map(([id, [x, y, w, h]]) => [id, { x, y, w, h }]),
  );
}

/** Écarts au-delà de la tolérance de 1 u (spec §7, loi 3). */
export function differences(
  reference: Geometry,
  actual: Geometry,
  tolerance = 1,
): string[] {
  const out: string[] = [];
  for (const [id, expected] of reference) {
    const got = actual.get(id);
    if (got === undefined) {
      out.push(`${id} : absent du DOM`);
      continue;
    }
    for (const key of ["x", "y", "w", "h"] as const) {
      const a = expected[key];
      const b = got[key];
      if (Math.abs(a - b) > tolerance + 1e-6)
        out.push(
          `${id}.${key} : référence ${format(a)}, navigateur ${format(b)}`,
        );
    }
  }
  for (const id of actual.keys())
    if (!reference.has(id))
      out.push(`${id} : absent de la géométrie de référence`);
  return out;
}

const format = (n: number): string => String(Math.round(n * 1000) / 1000);

export const rectOf = (g: Geometry, id: string): Rect => {
  const r = g.get(id);
  if (r === undefined) throw new Error(`pas de rectangle pour ${id}`);
  return r;
};

export function cleanTemp(): void {
  rmSync(TMP, { recursive: true, force: true });
}

export type { DesignSystem };
