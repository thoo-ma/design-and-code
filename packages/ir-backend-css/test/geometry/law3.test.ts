import * as fc from "fast-check";
import { normalize, parse } from "ir-core";
import { fixtureThemedDesignSystem, genIR } from "ir-core/testing";
import { layout, monospaceMeasure } from "ir-layout-ref";
import type { Geometry } from "ir-layout-ref";
import type { Node, Screen } from "ir-core";
import type { Browser, Page } from "playwright";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { covered } from "./font.js";
import {
  browserGeometry,
  cleanTemp,
  differences,
  launchBrowser,
  pageOf,
} from "./harness.js";
import type { Viewport } from "./harness.js";

const themed = fixtureThemedDesignSystem;
const ds = themed.light;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  cleanTemp();
  browser = await launchBrowser();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
  cleanTemp();
});

/** `geometry_ref(ir, V, M)` (spec §5). */
function reference(
  screen: Screen,
  viewport: Viewport,
  slots: Readonly<Record<string, string>>,
): Geometry {
  const r = layout(screen, {
    viewport,
    designSystem: ds,
    platform: { measureText: monospaceMeasure },
    slots,
  });
  if (!r.ok)
    throw new Error(r.errors.map((e) => `${e.code} ${e.path}`).join(", "));
  return r.value;
}

/** `geometry_css(compile(ir), V, M) ≈ geometry_ref(ir, V, M)` à 1 u près. */
async function checkLaw3(
  screen: Screen,
  viewport: Viewport,
  slots: Readonly<Record<string, string>> = {},
): Promise<string[]> {
  const html = await pageOf(screen, themed, slots);
  const actual = await browserGeometry(page, html, viewport);
  return differences(reference(screen, viewport, slots), actual);
}

describe("loi 3 — golden Login (spec §7, §8.3)", () => {
  const source = readFileSync(
    new URL("../../../../examples/Login.ir", import.meta.url),
    "utf8",
  );
  const parsed = parse(source);
  if (!parsed.ok) throw new Error("Login.ir ne parse pas");
  const login = normalize(parsed.value.screen).screen;
  const slots = { subtitle: "Connectez-vous pour continuer" };

  it.each([
    { w: 375, h: 812 },
    { w: 600, h: 800 },
    { w: 1024, h: 768 },
  ])("viewport %o", async (viewport) => {
    expect(await checkLaw3(login, viewport, slots)).toStrictEqual([]);
  });
});

/**
 * Corpus généré : les textes sont ramenés à l'alphabet de la police de test
 * (§8.3), caractère par caractère, en gardant longueur, espaces et sauts de
 * ligne — c'est là que la mesure est intéressante. Un caractère hors alphabet
 * tomberait sur une police de repli aux métriques inconnues, et la loi 3 est
 * énoncée à mesure fixée (§5.3).
 */
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function fontSafe(text: string): string {
  return Array.from(text)
    .map((c) =>
      c === "\n" || covered(c)
        ? c
        : (LETTERS[(c.codePointAt(0) ?? 0) % LETTERS.length] ?? "a"),
    )
    .join("");
}

function withSafeText(screen: Screen): Screen {
  const visit = (node: Node): Node => {
    if (node.type === "Stack")
      return { ...node, children: node.children.map(visit) };
    if (node.type !== "Text" || node.content.kind !== "literal") return node;
    return {
      ...node,
      content: { kind: "literal", value: fontSafe(node.content.value) },
    };
  };
  return { ...screen, root: visit(screen.root) };
}

/** Un exemple par slot : la référence et le compilateur reçoivent le même. */
function slotSamples(screen: Screen): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (node: Node): void => {
    if (node.type === "Stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type === "Text" && node.content.kind === "slot")
      out[node.content.name] = `${node.content.name} exemple de texte`;
    if (node.type === "Image" && node.content.kind === "slot")
      out[node.content.name] = node.content.name;
  };
  visit(screen.root);
  return out;
}

describe("loi 3 — corpus généré (spec §7, §8.1)", () => {
  it("200 IR × un viewport, géométrie CSS à 1 u de la référence", async () => {
    await fc.assert(
      fc.asyncProperty(
        genIR,
        fc.record({
          w: fc.integer({ min: 200, max: 1400 }),
          h: fc.integer({ min: 200, max: 1200 }),
        }),
        async (raw: Screen, viewport: Viewport) => {
          const screen = withSafeText(raw);
          expect(
            await checkLaw3(screen, viewport, slotSamples(screen)),
          ).toStrictEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
