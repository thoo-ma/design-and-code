import { describe, expect, it } from "vitest";

import { fnv1a32, normalize } from "../src/index.js";
import type {
  BoxProps,
  Node,
  Pad,
  Screen,
  StackNode,
  StackProps,
  TextNode,
  TextProps,
} from "../src/index.js";

const sp = (name: string) => ({ group: "space", path: [name] }) as const;
const color = { group: "color", path: ["text", "primary"] } as const;
const type = { group: "type", path: ["body", "md"] } as const;

const stack = (
  props: StackProps,
  children: readonly Node[] = [],
  overrides: StackNode["overrides"] = [],
  id?: string,
): StackNode => ({
  type: "Stack",
  ...(id === undefined ? {} : { id }),
  props,
  overrides,
  children,
});

const box = (props: BoxProps = {}, id?: string): Node => ({
  type: "Box",
  ...(id === undefined ? {} : { id }),
  props,
  overrides: [],
});

const text = (
  props: Omit<TextProps, "style" | "color">,
  overrides: TextNode["overrides"] = [],
  id?: string,
): TextNode => ({
  type: "Text",
  ...(id === undefined ? {} : { id }),
  props: { style: type, color, ...props },
  overrides,
  content: { kind: "literal", value: "x" },
});

const screen = (root: Node): Screen => ({ name: "S", root });

/** N puis retrait des ids générés, pour comparer la structure seule. */
const N = (root: Node) => {
  const result = normalize(screen(root));
  return {
    root: stripIds(result.screen.root),
    warnings: result.warnings.map((w) => [w.code, w.path]),
  };
};
const stripIds = (node: Node): Node => {
  const { id, ...rest } = node;
  void id;
  if (rest.type === "Stack")
    return { ...rest, children: rest.children.map(stripIds) };
  return rest;
};

describe("règle 1 — fill-in-hug", () => {
  it("un enfant fill sur l'axe principal d'un parent hug devient hug (W001)", () => {
    const before = stack(
      { dir: "v" },
      [box({ h: { kind: "fill" } }, "child")],
      [],
      "p",
    );
    const { root, warnings } = N(before);
    expect(root).toStrictEqual(stack({ dir: "v" }, [box({})]));
    expect(warnings).toStrictEqual([["W001", "p/child"]]);
  });

  it("idem sur l'axe secondaire", () => {
    const before = stack({ dir: "v" }, [
      box({ w: { kind: "fill" }, h: { kind: "fixed", value: 8 } }),
    ]);
    expect(N(before).root).toStrictEqual(
      stack({ dir: "v" }, [box({ h: { kind: "fixed", value: 8 } })]),
    );
  });

  it("un parent explicitement fill garde ses enfants fill", () => {
    const before = stack({ dir: "v", w: { kind: "fill" } }, [
      box({ w: { kind: "fill" } }),
    ]);
    expect(N(before)).toStrictEqual({ root: before, warnings: [] });
  });

  it("exception : le parent hug est étiré par son grand-parent (cas #actions de la spec)", () => {
    const before = stack({ dir: "v", crossAlign: "stretch" }, [
      stack({ dir: "h" }, [
        box({ w: { kind: "fill" }, h: { kind: "fixed", value: 48 } }),
      ]),
    ]);
    expect(N(before)).toStrictEqual({ root: before, warnings: [] });
  });

  it("pas d'exception si le grand-parent n'étire pas", () => {
    const before = stack({ dir: "v" }, [
      stack({ dir: "h" }, [box({ w: { kind: "fill" } })]),
    ]);
    expect(N(before).root).toStrictEqual(
      stack({ dir: "v" }, [stack({ dir: "h" }, [box({})])]),
    );
  });

  it("la racine fill reste fill : elle n'a pas de parent", () => {
    const before = stack({
      dir: "v",
      w: { kind: "fill" },
      h: { kind: "fill" },
    });
    expect(N(before)).toStrictEqual({ root: before, warnings: [] });
  });

  it("s'évalue par breakpoint : le parent devient hug en expanded, l'enfant reçoit une surcharge", () => {
    const parent = stack(
      { dir: "v", h: { kind: "fill" } },
      [box({ h: { kind: "fill" } })],
      [{ breakpoint: "expanded", props: { h: { kind: "hug" } } }],
    );
    const { root, warnings } = N(parent);
    expect(root).toStrictEqual(
      stack(
        { dir: "v", h: { kind: "fill" } },
        [
          {
            type: "Box",
            props: { h: { kind: "fill" } },
            overrides: [
              { breakpoint: "expanded", props: { h: { kind: "hug" } } },
            ],
          },
        ],
        [{ breakpoint: "expanded", props: { h: { kind: "hug" } } }],
      ),
    );
    expect(warnings).toStrictEqual([["W001", "Stack[0]/Box[0]"]]);
  });

  it("une Icon n'est jamais concernée", () => {
    const icon: Node = {
      type: "Icon",
      props: {
        name: { group: "icon", path: ["help"] },
        size: { group: "size", path: ["icon", "md"] },
        color,
      },
      overrides: [],
    };
    expect(N(stack({ dir: "v" }, [icon]))).toStrictEqual({
      root: stack({ dir: "v" }, [icon]),
      warnings: [],
    });
  });
});

describe("règle 2 — défauts", () => {
  it("omet toute propriété de base égale à son défaut", () => {
    const before = stack({
      dir: "v",
      w: { kind: "hug" },
      h: { kind: "hug" },
      gap: sp("none"),
      pad: [sp("none"), sp("none")],
      mainAlign: "start",
      crossAlign: "start",
      overflow: "visible",
      role: { kind: "none" },
    });
    expect(N(before).root).toStrictEqual(stack({ dir: "v" }));
  });

  it("garde les valeurs non défaut", () => {
    const before = stack({
      dir: "h",
      w: { kind: "fill" },
      crossAlign: "stretch",
      gap: sp("md"),
    });
    expect(N(before).root).toStrictEqual(before);
  });

  it("Text : align start et Image : fit cover sont des défauts", () => {
    const t = text({ align: "start" });
    expect(N(t).root).toStrictEqual(text({}));
    const img: Node = {
      type: "Image",
      props: { fit: "cover" },
      overrides: [],
      content: { kind: "slot", name: "i" },
    };
    expect(N(img).root).toStrictEqual({ ...img, props: {} });
  });
});

describe("règle 3 — surcharges sans effet", () => {
  it("supprime une surcharge entièrement égale à la base (W003)", () => {
    const before = stack(
      { dir: "v", gap: sp("md") },
      [],
      [
        {
          breakpoint: "expanded",
          props: { gap: sp("md"), w: { kind: "hug" } },
        },
      ],
      "s",
    );
    const { root, warnings } = N(before);
    expect(root).toStrictEqual(stack({ dir: "v", gap: sp("md") }));
    expect(warnings).toStrictEqual([["W003", "s"]]);
  });

  it("omet seulement les propriétés redondantes d'une surcharge utile", () => {
    const before = stack(
      { dir: "v" },
      [],
      [
        {
          breakpoint: "expanded",
          props: { w: { kind: "fill" }, h: { kind: "hug" } },
        },
      ],
    );
    expect(N(before)).toStrictEqual({
      root: stack(
        { dir: "v" },
        [],
        [{ breakpoint: "expanded", props: { w: { kind: "fill" } } }],
      ),
      warnings: [],
    });
  });

  it("une surcharge vide à l'entrée est supprimée", () => {
    const before = box({}, undefined);
    const withEmpty: Node = {
      ...before,
      overrides: [{ breakpoint: "expanded", props: {} }],
    };
    expect(N(withEmpty).root).toStrictEqual(before);
  });
});

describe("règle 2 — label vide", () => {
  it('label: "" vaut l\'absence de label', () => {
    expect(N(box({ label: "" })).root).toStrictEqual(box({}));
    expect(N(box({ label: "Email" })).root).toStrictEqual(
      box({ label: "Email" }),
    );
  });
});

describe("règle 4 — truncate", () => {
  it("end avec maxLines est le défaut", () => {
    expect(N(text({ maxLines: 2, truncate: "end" })).root).toStrictEqual(
      text({ maxLines: 2 }),
    );
  });
  it("none sans maxLines est le défaut", () => {
    expect(N(text({ truncate: "none" })).root).toStrictEqual(text({}));
  });
  it("none avec maxLines est porteur de sens", () => {
    const t = text({ maxLines: 2, truncate: "none" });
    expect(N(t).root).toStrictEqual(t);
  });
  it("end sans maxLines est sans effet, donc omis", () => {
    expect(N(text({ truncate: "end" })).root).toStrictEqual(text({}));
  });
  it("none sans maxLines est déplacé dans la surcharge qui ajoute maxLines", () => {
    const t = text({ truncate: "none" }, [
      { breakpoint: "expanded", props: { maxLines: 3 } },
    ]);
    expect(N(t).root).toStrictEqual(
      text({}, [
        { breakpoint: "expanded", props: { maxLines: 3, truncate: "none" } },
      ]),
    );
  });
  it("deux écritures de même sens ont la même forme normale", () => {
    const atBase = text({ truncate: "none" }, [
      { breakpoint: "expanded", props: { maxLines: 3 } },
    ]);
    const inOverride = text({}, [
      { breakpoint: "expanded", props: { maxLines: 3, truncate: "none" } },
    ]);
    expect(N(atBase)).toStrictEqual(N(inOverride));
    expect(N(inOverride).root).toStrictEqual(inOverride);
  });
  it("none à la base avec maxLines reste à la base, et la surcharge qui change maxLines ne le répète pas", () => {
    const t = text({ maxLines: 2, truncate: "none" }, [
      { breakpoint: "expanded", props: { maxLines: 3, truncate: "none" } },
    ]);
    expect(N(t).root).toStrictEqual(
      text({ maxLines: 2, truncate: "none" }, [
        { breakpoint: "expanded", props: { maxLines: 3 } },
      ]),
    );
  });
  it("une surcharge qui passe de none à end porte end", () => {
    const t = text({ maxLines: 2, truncate: "none" }, [
      { breakpoint: "expanded", props: { truncate: "end" } },
    ]);
    expect(N(t).root).toStrictEqual(t);
  });
  it("dans une surcharge, truncate: end est redondant dès que maxLines est effectif", () => {
    const t = text({ maxLines: 2 }, [
      { breakpoint: "expanded", props: { maxLines: 3, truncate: "end" } },
    ]);
    expect(N(t).root).toStrictEqual(
      text({ maxLines: 2 }, [
        { breakpoint: "expanded", props: { maxLines: 3 } },
      ]),
    );
  });
});

describe("règle 5 — ordre canonique des clés", () => {
  it("réordonne les clés de la base et des surcharges selon §4", () => {
    const shuffled: StackProps = {
      bg: { group: "color", path: ["accent"] },
      dir: "h",
      role: { kind: "button" },
      gap: sp("sm"),
      w: { kind: "fill" },
      maxW: 480,
    };
    const result = normalize(
      screen(
        stack(
          shuffled,
          [],
          [
            {
              breakpoint: "expanded",
              props: { gap: sp("md"), w: { kind: "hug" } },
            },
          ],
        ),
      ),
    );
    expect(Object.keys(result.screen.root.props)).toStrictEqual([
      "w",
      "maxW",
      "dir",
      "gap",
      "bg",
      "role",
    ]);
    expect(
      Object.keys(result.screen.root.overrides[0]?.props ?? {}),
    ).toStrictEqual(["w", "gap"]);
  });
});

describe("règle 6 — identifiants", () => {
  it("FNV-1a 32 bits de « type:chemin »", () => {
    expect(fnv1a32("")).toBe("811c9dc5");
    expect(fnv1a32("a")).toBe("e40c292c");
  });

  it("assigne #n_<hash> aux nœuds sans id, déterministe et stable", () => {
    const before = stack({ dir: "v" }, [box(), text({})]);
    const once = normalize(screen(before)).screen.root;
    const twice = normalize(screen(before)).screen.root;
    expect(once).toStrictEqual(twice);
    expect(once.id).toBe(`n_${fnv1a32("Stack:")}`);
    if (once.type === "Stack") {
      expect(once.children[0]?.id).toBe(`n_${fnv1a32("Box:0")}`);
      expect(once.children[1]?.id).toBe(`n_${fnv1a32("Text:1")}`);
    }
  });

  it("ne touche pas aux ids existants", () => {
    const result = normalize(
      screen(stack({ dir: "v" }, [box({}, "email")], [], "root")),
    );
    expect(result.screen.root.id).toBe("root");
    if (result.screen.root.type === "Stack")
      expect(result.screen.root.children[0]?.id).toBe("email");
  });

  it("suffixe par le chemin d'indices en cas de collision", () => {
    const taken = `n_${fnv1a32("Box:0")}`;
    const result = normalize(
      screen(stack({ dir: "v" }, [box(), box({}, taken)], [], "root")),
    );
    if (result.screen.root.type === "Stack") {
      expect(result.screen.root.children[0]?.id).toBe(`${taken}_0`);
      expect(result.screen.root.children[1]?.id).toBe(taken);
    }
  });
});

describe("règle 7 — padding", () => {
  it.each<[string, Pad, Pad]>([
    ["($a, $a) → $a", [sp("md"), sp("md")], sp("md")],
    [
      "($a, $b, $a, $b) → ($a, $b)",
      [sp("md"), sp("sm"), sp("md"), sp("sm")],
      [sp("md"), sp("sm")],
    ],
    [
      "($a, $a, $a, $a) → $a",
      [sp("md"), sp("md"), sp("md"), sp("md")],
      sp("md"),
    ],
    ["($a, $b) reste", [sp("md"), sp("sm")], [sp("md"), sp("sm")]],
    [
      "($a, $b, $c, $d) reste",
      [sp("xs"), sp("sm"), sp("md"), sp("lg")],
      [sp("xs"), sp("sm"), sp("md"), sp("lg")],
    ],
  ])("%s", (_label, before, after) => {
    expect(N(stack({ dir: "v", pad: before })).root).toStrictEqual(
      stack({ dir: "v", pad: after }),
    );
  });

  it("s'applique aussi dans les surcharges", () => {
    const before = stack(
      { dir: "v" },
      [],
      [{ breakpoint: "expanded", props: { pad: [sp("lg"), sp("lg")] } }],
    );
    expect(N(before).root).toStrictEqual(
      stack(
        { dir: "v" },
        [],
        [{ breakpoint: "expanded", props: { pad: sp("lg") } }],
      ),
    );
  });
});
