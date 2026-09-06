import { readFileSync } from "node:fs";

import * as fc from "fast-check";
import { loadDesignSystem, loadThemedDesignSystem } from "ir-core";
import type { ThemedDesignSystem } from "ir-core";
import { fixtureThemedDesignSystem, genTokensJson } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import { compileTokensCss, cssColor } from "../src/index.js";

const OPTIONS = { sources: ["tokens.json", "tokens.dark.json"] };
const expected = readFileSync(
  new URL(
    "../../../fixtures/design-system/expected/tokens.css",
    import.meta.url,
  ),
  "utf8",
);

const themed = (tokens: unknown, dark?: unknown): ThemedDesignSystem => {
  const r = loadThemedDesignSystem(tokens, dark);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("golden : tokens.css (spec T5)", () => {
  it("reproduit fixtures/design-system/expected/tokens.css à l'octet près", () => {
    const result = compileTokensCss(fixtureThemedDesignSystem, OPTIONS);
    expect(result.ok, result.ok ? "" : JSON.stringify(result.errors)).toBe(
      true,
    );
    if (result.ok) expect(result.value).toBe(expected);
  });
});

describe("E010 : deux tokens de même nom CSS (loi 2)", () => {
  it("size.icon-md et size.icon.md donneraient tous deux --size-icon-md", () => {
    const px = (value: number) => ({ $value: { value, unit: "px" } });
    const r = compileTokensCss(
      themed({
        size: { $type: "dimension", "icon-md": px(24), icon: { md: px(24) } },
      }),
      OPTIONS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E010 size.icon.md",
      ]);
  });
});

describe("valeurs", () => {
  it("couleur : hex du fichier, sinon calculé depuis les composantes, rgba si alpha < 1", () => {
    expect(
      cssColor({ colorSpace: "srgb", components: [1, 0, 0], hex: "#FF0000" }),
    ).toBe("#FF0000");
    expect(cssColor({ colorSpace: "srgb", components: [1, 0.5, 0] })).toBe(
      "#FF8000",
    );
    expect(
      cssColor({
        colorSpace: "srgb",
        components: [0, 0, 0],
        alpha: 0.5,
        hex: "#000000",
      }),
    ).toBe("rgba(0, 0, 0, 0.5)");
    expect(cssColor("red")).toBeUndefined();
  });

  it("sans overlay sombre, pas de bloc [data-theme=dark]", () => {
    const r = compileTokensCss(
      themed({
        space: {
          $type: "dimension",
          md: { $value: { value: 16, unit: "px" } },
        },
      }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toContain("--space-md: 16px;");
      expect(r.value).not.toContain("data-theme");
      expect(r.value).not.toContain("type-");
    }
  });

  it("E010 : type DTCG sans traduction CSS", () => {
    const r = compileTokensCss(
      themed({ font: { $type: "fontFamily", sans: { $value: ["Inter"] } } }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E010 font.sans",
      ]);
  });

  it("E010 : dimension dans une autre unité que px", () => {
    const r = compileTokensCss(
      themed({
        space: {
          $type: "dimension",
          md: { $value: { value: 1, unit: "rem" } },
        },
      }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(false);
  });

  it("E010 : typographie incomplète", () => {
    const r = compileTokensCss(
      themed({
        type: {
          $type: "typography",
          body: { $value: { fontSize: { value: 16, unit: "px" } } },
        },
      }),
      { sources: ["tokens.json"] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.path).toBe("type.body");
  });
});

describe("propriété : chaque feuille devient une variable, relue à l'identique", () => {
  const format = (type: string, value: unknown): string => {
    if (type === "dimension")
      return `${String((value as { value: number }).value)}px`;
    if (type === "number") return String(value);
    return (value as { hex: string }).hex;
  };

  it("sur des fichiers DTCG générés", () => {
    fc.assert(
      fc.property(genTokensJson, ({ json, leaves }) => {
        const ds = loadDesignSystem(json);
        expect(ds.ok).toBe(true);
        if (!ds.ok) return;
        const r = compileTokensCss(
          { light: ds.value, dark: undefined, darkKeys: [] },
          { sources: ["t.json"] },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const declared = new Map<string, string>();
        for (const m of r.value.matchAll(
          /^ {2}--([A-Za-z0-9-]+): ([^;]+);$/gm,
        )) {
          if (m[1] !== undefined && m[2] !== undefined)
            declared.set(m[1], m[2]);
        }
        expect(declared.size).toBe(leaves.length);
        for (const leaf of leaves) {
          expect(declared.get(leaf.key.replaceAll(".", "-"))).toBe(
            format(leaf.type, leaf.value),
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
