import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normalize, parse, typecheck } from "ir-core";
import { fixtureDesignSystem } from "ir-core/testing";

import { layout, monospaceMeasure } from "../src/index.js";

import expected from "../../../examples/Login.geometry.json" with { type: "json" };

const source = readFileSync(
  new URL("../../../examples/Login.ir", import.meta.url),
  "utf8",
);

/** Valeur d'exemple du slot, celle du #Preview de la spec §10.3. */
export const LOGIN_SLOTS = { subtitle: "Connectez-vous pour continuer" };
export const LOGIN_VIEWPORTS = [
  { w: 375, h: 812 },
  { w: 600, h: 800 },
  { w: 1024, h: 768 },
] as const;

describe("golden : géométrie de Login.ir à trois viewports (spec §8.2)", () => {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error("Login.ir ne parse pas");
  const screen = normalize(parsed.value.screen).screen;

  it("Login.ir typecheck contre la fixture", () => {
    expect(typecheck(screen, fixtureDesignSystem)).toStrictEqual([]);
  });

  it.each(LOGIN_VIEWPORTS)("viewport %o", (viewport) => {
    const result = layout(screen, {
      viewport,
      designSystem: fixtureDesignSystem,
      platform: { measureText: monospaceMeasure },
      slots: LOGIN_SLOTS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const key = `${String(viewport.w)}x${String(viewport.h)}`;
    const rects = Object.fromEntries(result.value);
    expect(rects).toStrictEqual((expected as Record<string, unknown>)[key]);
  });
});
