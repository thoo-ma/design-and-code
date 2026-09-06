import { readFileSync } from "node:fs";

import * as fc from "fast-check";
import { loadDesignSystem, loadThemedDesignSystem } from "ir-core";
import type { ThemedDesignSystem } from "ir-core";
import { fixtureThemedDesignSystem, genTokensJson } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import {
  camel,
  compileTokensSwift,
  hex24,
  swiftFont,
  swiftIdentifier,
} from "../src/index.js";

const OPTIONS = { sources: ["tokens.json", "tokens.dark.json"] };
const expected = readFileSync(
  new URL(
    "../../../fixtures/design-system/expected/Tokens.swift",
    import.meta.url,
  ),
  "utf8",
);

const themed = (
  tokens: unknown,
  dark?: unknown,
  icons?: unknown,
): ThemedDesignSystem => {
  const r = loadThemedDesignSystem(tokens, dark, icons);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("golden : Tokens.swift (spec T5)", () => {
  it("reproduit fixtures/design-system/expected/Tokens.swift à l'octet près", () => {
    const result = compileTokensSwift(fixtureThemedDesignSystem, OPTIONS);
    expect(result.ok, result.ok ? "" : JSON.stringify(result.errors)).toBe(
      true,
    );
    if (result.ok) expect(result.value).toBe(expected);
  });
});

describe("nommage", () => {
  it("échappe les mots-clés Swift et met les noms en camelCase", () => {
    expect(swiftIdentifier("default")).toBe("`default`");
    expect(swiftIdentifier("canvas")).toBe("canvas");
    expect(camel(["chevron-right"])).toBe("chevronRight");
    expect(camel(["heading", "lg"])).toBe("headingLg");
  });

  it("hex depuis le fichier ou depuis les composantes", () => {
    expect(hex24({ hex: "#ffffff", components: [1, 1, 1] })).toBe("0xFFFFFF");
    expect(hex24({ components: [1, 0.5, 0] })).toBe("0xFF8000");
    expect(hex24("x")).toBeUndefined();
  });

  it("police : première famille, taille, graisse nommée", () => {
    expect(
      swiftFont({
        fontFamily: ["Inter", "sans-serif"],
        fontSize: { value: 28, unit: "px" },
        fontWeight: 700,
      }),
    ).toBe('Font.custom("Inter", size: 28).weight(.bold)');
    expect(
      swiftFont({
        fontFamily: "Inter",
        fontSize: { value: 28, unit: "px" },
        fontWeight: 450,
      }),
    ).toBeUndefined();
  });
});

describe("erreurs", () => {
  it("E002 : icône sans nom ios (ADR-005)", () => {
    const ds = themed(
      {
        space: {
          $type: "dimension",
          md: { $value: { value: 16, unit: "px" } },
        },
      },
      undefined,
      { icons: { help: { web: "help-circle" } } },
    );
    const r = compileTokensSwift(ds, { sources: ["tokens.json"] });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E002 icons.help",
      ]);
  });

  it("E010 : type DTCG sans traduction", () => {
    const r = compileTokensSwift(
      themed({ font: { $type: "fontFamily", sans: { $value: ["Inter"] } } }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E010 font.sans",
      ]);
  });

  it("sans overlay sombre, les couleurs sont les mêmes en clair et en sombre", () => {
    const r = compileTokensSwift(
      themed({
        color: {
          $type: "color",
          accent: {
            $value: { hex: "#2F6FDE", components: [0.18, 0.44, 0.87] },
          },
        },
      }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toContain(
        "static let accent = Color(light: 0x2F6FDE, dark: 0x2F6FDE)",
      );
  });
});

describe("propriété : chaque feuille devient un static let dans l'enum de son groupe", () => {
  it("sur des fichiers DTCG générés", () => {
    fc.assert(
      fc.property(genTokensJson, ({ json, leaves }) => {
        const ds = loadDesignSystem(json);
        expect(ds.ok).toBe(true);
        if (!ds.ok) return;
        const r = compileTokensSwift(
          { light: ds.value, dark: undefined, darkKeys: [] },
          { sources: ["t.json"] },
        );
        expect(r.ok, r.ok ? "" : JSON.stringify(r.errors)).toBe(true);
        if (!r.ok) return;
        const declared = [
          ...r.value.matchAll(/static let (`?[A-Za-z0-9]+`?)/g),
        ].map((m) => m[1]);
        expect(declared).toHaveLength(leaves.length);
        for (const leaf of leaves) {
          const name = leaf.key.split(".").at(-1) ?? "";
          expect(declared).toContain(swiftIdentifier(name));
          expect(r.value).toContain(`enum ${leaf.key.split(".")[0] ?? ""} {`);
        }
      }),
      { numRuns: 200 },
    );
  });
});
