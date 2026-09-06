import { describe, expect, it } from "vitest";

import { fixtureDesignSystem } from "ir-core/testing";

import { layout, monospaceMeasure, wrapLines } from "../src/index.js";
import type { Typography } from "../src/index.js";

import {
  box,
  fill,
  fixed,
  hug,
  rect,
  run,
  screen,
  sp,
  stack,
  text,
} from "./helpers.js";

/** Racine 300×200, pad md (16), gap sm (8), deux boîtes de 40 de haut, pleine largeur. */
const twoBoxes = (extra = {}) =>
  stack(
    "root",
    {
      dir: "v",
      w: fill,
      h: fill,
      pad: sp("md"),
      gap: sp("sm"),
      crossAlign: "stretch",
      ...extra,
    },
    [box("a", { h: fixed(40) }), box("b", { h: fixed(40) })],
  );

describe("Stack vertical : padding, gap, alignements (spec §5.2)", () => {
  it("start : les enfants commencent au padding, étirés sur la largeur intérieure", () => {
    const g = run(twoBoxes());
    expect(rect(g, "root")).toStrictEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect(rect(g, "a")).toStrictEqual({ x: 16, y: 16, w: 268, h: 40 });
    expect(rect(g, "b")).toStrictEqual({ x: 16, y: 64, w: 268, h: 40 });
  });

  it.each<[string, "center" | "end" | "between", number, number]>([
    ["center", "center", 56, 104],
    ["end", "end", 96, 144],
    ["between", "between", 16, 144],
  ])("mainAlign %s", (_label, mainAlign, ya, yb) => {
    const g = run(twoBoxes({ mainAlign }));
    expect(rect(g, "a").y).toBe(ya);
    expect(rect(g, "b").y).toBe(yb);
  });

  it("between avec un seul enfant vaut start", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill, mainAlign: "between" }, [
        box("a", { h: fixed(40), w: fill }),
      ]),
    );
    expect(rect(g, "a").y).toBe(0);
  });

  it("crossAlign center et end sur un enfant fixed en largeur", () => {
    const child = box("a", { w: fixed(100), h: fixed(40) });
    expect(
      rect(
        run(
          stack(
            "root",
            { dir: "v", w: fill, h: fill, pad: sp("md"), crossAlign: "center" },
            [child],
          ),
        ),
        "a",
      ).x,
    ).toBe(100);
    expect(
      rect(
        run(
          stack(
            "root",
            { dir: "v", w: fill, h: fill, pad: sp("md"), crossAlign: "end" },
            [child],
          ),
        ),
        "a",
      ).x,
    ).toBe(184);
  });

  it("padding à deux et quatre valeurs", () => {
    const g2 = run(
      stack("root", { dir: "v", w: fill, h: fill, pad: [sp("md"), sp("xs")] }, [
        box("a", { w: fill, h: fixed(10) }),
      ]),
    );
    expect(rect(g2, "a")).toStrictEqual({ x: 4, y: 16, w: 292, h: 10 });
    const g4 = run(
      stack(
        "root",
        {
          dir: "v",
          w: fill,
          h: fill,
          pad: [sp("xs"), sp("sm"), sp("md"), sp("lg")],
        },
        [box("a", { w: fill, h: fixed(10) })],
      ),
    );
    expect(rect(g4, "a")).toStrictEqual({ x: 24, y: 4, w: 268, h: 10 });
  });
});

describe("hug et fill", () => {
  it("un Stack hug mesure son contenu plus les gaps et le padding", () => {
    const g = run(
      stack("root", { dir: "h", gap: sp("sm"), pad: [sp("xs"), sp("md")] }, [
        box("a", { w: fixed(30), h: fixed(10) }),
        box("b", { w: fixed(50), h: fixed(20) }),
      ]),
    );
    expect(rect(g, "root")).toStrictEqual({
      x: 0,
      y: 0,
      w: 30 + 8 + 50 + 32,
      h: 20 + 8,
    });
    expect(rect(g, "b")).toStrictEqual({ x: 16 + 30 + 8, y: 4, w: 50, h: 20 });
  });

  it("les fill se partagent le reste à parts égales", () => {
    const g = run(
      stack("root", { dir: "h", w: fill, h: fill, gap: sp("sm") }, [
        box("a", { w: fixed(60), h: fill }),
        box("b", { w: fill, h: fill }),
        box("c", { w: fill, h: fill }),
      ]),
    );
    expect(rect(g, "b")).toStrictEqual({ x: 68, y: 0, w: 112, h: 200 });
    expect(rect(g, "c")).toStrictEqual({ x: 188, y: 0, w: 112, h: 200 });
  });

  it("un fill borné par maxW est gelé et le reste va aux autres (gel flexbox)", () => {
    const g = run(
      stack("root", { dir: "h", w: fill, h: fill }, [
        box("a", { w: fill, h: fill, maxW: 50 }),
        box("b", { w: fill, h: fill }),
      ]),
    );
    expect(rect(g, "a").w).toBe(50);
    expect(rect(g, "b")).toStrictEqual({ x: 50, y: 0, w: 250, h: 200 });
  });

  it("un Stack hug borné par minW distribue l'espace libre selon mainAlign", () => {
    const g = run(
      stack("root", { dir: "h", minW: 200, mainAlign: "center" }, [
        box("a", { w: fixed(30), h: fixed(10) }),
      ]),
    );
    expect(rect(g, "root").w).toBe(200);
    expect(rect(g, "a").x).toBe(85);
  });

  it("les min/max d'un Stack bornent l'espace proposé aux enfants avant sa taille", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill, maxW: 120 }, [
        box("a", { w: fill, h: fixed(10) }),
      ]),
    );
    expect(rect(g, "root").w).toBe(120);
    expect(rect(g, "a").w).toBe(120);
  });

  it("étirement par crossAlign: stretch, et fill dans un parent hug étiré (cas #actions)", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill, crossAlign: "stretch" }, [
        stack("actions", { dir: "h", gap: sp("sm") }, [
          box("primary", { w: fill, h: fixed(48) }),
          {
            type: "Icon",
            id: "help",
            props: {
              name: { group: "icon", path: ["help"] },
              size: { group: "size", path: ["icon", "md"] },
              color: { group: "color", path: ["accent"] },
            },
            overrides: [],
          },
        ]),
      ]),
    );
    expect(rect(g, "actions")).toStrictEqual({ x: 0, y: 0, w: 300, h: 48 });
    expect(rect(g, "primary")).toStrictEqual({ x: 0, y: 0, w: 268, h: 48 });
    expect(rect(g, "help")).toStrictEqual({ x: 276, y: 0, w: 24, h: 24 });
  });

  it("un enfant fixed sur cross n'est jamais étiré", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill, crossAlign: "stretch" }, [
        box("a", { w: fixed(50), h: fixed(10) }),
      ]),
    );
    expect(rect(g, "a").w).toBe(50);
  });

  it("Image : ratio dérive l'axe non résolu", () => {
    const img: import("ir-core").Node = {
      type: "Image",
      id: "img",
      props: { w: fill, ratio: [2, 1] },
      overrides: [],
      content: { kind: "slot", name: "src" },
    };
    const g = run(stack("root", { dir: "v", w: fill, h: fill }, [img]));
    expect(rect(g, "img")).toStrictEqual({ x: 0, y: 0, w: 300, h: 150 });
  });
});

describe("texte (spec §5.3, mesure monospace)", () => {
  const body: Typography = {
    fontFamily: ["Inter"],
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: 400,
    letterSpacing: 0,
  };

  it("replie aux espaces à la largeur disponible ; un mot trop long déborde", () => {
    expect(wrapLines("aaaa bbbb cccc", body, 100)).toStrictEqual([9, 4]);
    expect(wrapLines("aaaa bbbb cccc", body, Infinity)).toStrictEqual([14]);
    expect(wrapLines("abcdefghijklmnop", body, 50)).toStrictEqual([16]);
    expect(monospaceMeasure("", body, 100, undefined)).toStrictEqual({
      w: 0,
      h: 0,
    });
  });

  it("un Text hug qui se replie prend la largeur offerte (ADR-011), maxLines tronque", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill }, [
        text("t", "aaaa bbbb cccc"),
        text("u", "aaaa bbbb cccc", { maxLines: 1 }),
      ]),
      { w: 100, h: 200 },
    );
    expect(rect(g, "t")).toStrictEqual({ x: 0, y: 0, w: 100, h: 48 });
    expect(rect(g, "u")).toStrictEqual({ x: 0, y: 48, w: 100, h: 24 });
  });

  it("un Text hug qui tient sur une ligne garde la largeur de son texte", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill }, [text("t", "aaaa")]),
      { w: 100, h: 200 },
    );
    expect(rect(g, "t")).toStrictEqual({ x: 0, y: 0, w: 4 * 9.6, h: 24 });
  });

  it("un Text hug sur l'axe principal d'un Stack horizontal se mesure en une ligne", () => {
    const g = run(
      stack("root", { dir: "h", w: fill, h: fill }, [
        text("t", "aaaa bbbb cccc"),
      ]),
      { w: 100, h: 200 },
    );
    expect(rect(g, "t")).toStrictEqual({ x: 0, y: 0, w: 14 * 9.6, h: 24 });
  });

  it("les slots reçoivent leur valeur d'exemple, sinon la chaîne vide", () => {
    const slotText: import("ir-core").TextNode = {
      ...text("t", ""),
      content: { kind: "slot", name: "title" },
    };
    const withValue = run(
      stack("root", { dir: "v", w: fill, h: fill }, [slotText]),
      undefined,
      { slots: { title: "ab" } },
    );
    expect(rect(withValue, "t").w).toBe(2 * 9.6);
    expect(
      rect(run(stack("root", { dir: "v", w: fill, h: fill }, [slotText])), "t"),
    ).toStrictEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("scroll, breakpoints, erreurs", () => {
  it("un Stack scroll propose l'infini sur son axe : le contenu déborde sans décalage", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fixed(100), overflow: "scroll" }, [
        box("a", { w: fill, h: fixed(60) }),
        box("b", { w: fill, h: fixed(60) }),
      ]),
    );
    expect(rect(g, "root").h).toBe(100);
    expect(rect(g, "b")).toStrictEqual({ x: 0, y: 60, w: 300, h: 60 });
  });

  it("E007 : fill sur l'axe de défilement (ADR-008)", () => {
    const result = layout(
      screen(
        stack(
          "root",
          { dir: "v", w: fill, h: fixed(100), overflow: "scroll" },
          [box("a", { w: fill, h: fill })],
        ),
      ),
      {
        viewport: { w: 300, h: 200 },
        designSystem: fixtureDesignSystem,
        platform: { measureText: monospaceMeasure },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E007 root/a",
      ]);
  });

  it("le breakpoint actif est le plus grand seuil ≤ largeur du viewport", () => {
    const root = stack(
      "root",
      { dir: "v", w: fill, h: fill, pad: sp("md") },
      [box("a", { w: fill, h: fixed(10) })],
      [{ breakpoint: "expanded", props: { pad: sp("xl") } }],
    );
    expect(rect(run(root, { w: 599, h: 100 }), "a").x).toBe(16);
    expect(rect(run(root, { w: 600, h: 100 }), "a").x).toBe(32);
  });

  it("un nœud sans id est repéré par son chemin d'indices", () => {
    const g = run(
      stack("root", { dir: "v", w: fill, h: fill }, [
        { type: "Box", props: { w: fill, h: fixed(10) }, overrides: [] },
      ]),
    );
    expect(g.get("/0")).toStrictEqual({ x: 0, y: 0, w: 300, h: 10 });
  });

  it("un espace libre négatif : center déborde des deux côtés, between vaut start", () => {
    const children = [
      box("a", { w: fill, h: fixed(80) }),
      box("b", { w: fill, h: fixed(80) }),
    ];
    expect(
      rect(
        run(
          stack(
            "root",
            { dir: "v", w: fill, h: fixed(100), mainAlign: "center" },
            children,
          ),
        ),
        "a",
      ).y,
    ).toBe(-30);
    expect(
      rect(
        run(
          stack(
            "root",
            { dir: "v", w: fill, h: fixed(100), mainAlign: "between" },
            children,
          ),
        ),
        "a",
      ).y,
    ).toBe(0);
  });

  it("les tokens et les slots viennent des options ; hug plus icône", () => {
    const g = run(
      stack("root", { dir: "h" }, [
        {
          type: "Icon",
          id: "i",
          props: {
            name: { group: "icon", path: ["help"] },
            size: { group: "size", path: ["icon", "lg"] },
            color: { group: "color", path: ["accent"] },
          },
          overrides: [],
        },
      ]),
    );
    expect(rect(g, "root")).toStrictEqual({ x: 0, y: 0, w: 32, h: 32 });
    expect(hug.kind).toBe("hug");
  });
});
