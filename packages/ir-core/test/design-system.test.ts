import { describe, expect, it } from "vitest";

import { loadDesignSystem } from "../src/index.js";
import {
  fixtureDesignSystem,
  fixtureIcons,
  fixtureTokens,
} from "../src/testing/index.js";

const codesOf = (tokens: unknown, icons?: unknown): string[] => {
  const r = loadDesignSystem(tokens, icons);
  return r.ok ? [] : r.errors.map((e) => `${e.code} ${e.path}`);
};

describe("chargement du design system de fixture (DTCG)", () => {
  it("se charge sans erreur", () => {
    expect(loadDesignSystem(fixtureTokens, fixtureIcons).ok).toBe(true);
  });

  it("hérite $type du groupe et résout les alias, récursivement", () => {
    const canvas = fixtureDesignSystem.tokens.get("color.bg.canvas");
    expect(canvas?.type).toBe("color");
    expect(canvas?.value).toStrictEqual({
      colorSpace: "srgb",
      components: [1, 1, 1],
      hex: "#FFFFFF",
    });
    const heading = fixtureDesignSystem.tokens.get("type.heading.lg");
    expect(heading?.type).toBe("typography");
    expect(heading?.value).toMatchObject({
      fontFamily: ["Inter", "system-ui", "sans-serif"],
      fontWeight: 600,
    });
  });

  it("marque les primitives non référençables", () => {
    expect(
      fixtureDesignSystem.tokens.get("color.palette.gray.0")?.referenceable,
    ).toBe(false);
    expect(
      fixtureDesignSystem.tokens.get("font.weight.regular")?.referenceable,
    ).toBe(false);
    expect(
      fixtureDesignSystem.tokens.get("color.text.primary")?.referenceable,
    ).toBe(true);
    expect(fixtureDesignSystem.tokens.get("space.md")?.referenceable).toBe(
      true,
    );
  });

  it("lit les breakpoints et le jeu d'icônes", () => {
    expect([...fixtureDesignSystem.breakpoints]).toStrictEqual([
      ["compact", 0],
      ["expanded", 600],
    ]);
    expect([...fixtureDesignSystem.icons.keys()]).toStrictEqual([
      "help",
      "check",
      "close",
      "chevron-right",
      "search",
    ]);
    expect(fixtureDesignSystem.icons.get("help")).toStrictEqual({
      web: "help-circle",
      ios: "questionmark.circle",
      android: "help_outline",
    });
  });

  it("garde les dimensions en px telles quelles (1 px = 1 u)", () => {
    expect(fixtureDesignSystem.tokens.get("space.md")?.value).toStrictEqual({
      value: 16,
      unit: "px",
    });
  });
});

describe("E010 — design system invalide", () => {
  it("racine qui n'est pas un objet", () => {
    expect(codesOf([])).toStrictEqual(["E010 "]);
    expect(codesOf("x")).toStrictEqual(["E010 "]);
  });

  it("alias vers un token inexistant", () => {
    expect(
      codesOf({
        color: { $type: "color", bg: { $value: "{color.palette.missing}" } },
      }),
    ).toStrictEqual(["E010 color.bg"]);
  });

  it("alias cyclique", () => {
    const codes = codesOf({
      a: { $type: "color", $value: "{b}" },
      b: { $type: "color", $value: "{a}" },
    });
    expect(codes).toContain("E010 a");
  });

  it("token sans $type", () => {
    expect(
      codesOf({ space: { md: { $value: { value: 16, unit: "px" } } } }),
    ).toStrictEqual(["E010 space.md"]);
  });

  it("clé de groupe qui n'est ni un groupe ni un token", () => {
    expect(codesOf({ space: { $type: "dimension", md: 16 } })).toStrictEqual([
      "E010 space.md",
    ]);
  });

  it("breakpoint qui n'est pas une dimension en px", () => {
    expect(
      codesOf({
        bp: {
          $type: "dimension",
          expanded: { $value: { value: 40, unit: "rem" } },
        },
      }),
    ).toStrictEqual(["E010 bp.expanded"]);
  });

  it("deux icônes de même nom pour un backend sont indistinguables (loi 2)", () => {
    expect(
      codesOf(
        {},
        { icons: { a: { web: "x", ios: "a" }, b: { web: "x", ios: "b" } } },
      ),
    ).toStrictEqual(["E010 icons.b"]);
    expect(
      codesOf({}, { icons: { a: { web: "x" }, b: { ios: "x" } } }),
    ).toStrictEqual([]);
  });

  it("icons.json mal formé", () => {
    expect(codesOf({}, { nope: {} })).toStrictEqual(["E010 icons"]);
    expect(codesOf({}, { icons: { help: { web: 1 } } })).toStrictEqual([
      "E010 icons.help",
    ]);
  });

  it("un alias hérite le type de sa cible (règle DTCG)", () => {
    const r = loadDesignSystem({
      base: { $type: "dimension", one: { $value: { value: 1, unit: "px" } } },
      alias: { $value: "{base.one}" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tokens.get("alias")?.type).toBe("dimension");
  });
});
