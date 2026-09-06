import { describe, expect, it } from "vitest";

import { loadDesignSystem, parse, typecheck } from "../src/index.js";
import type { IRError, Node, Screen } from "../src/index.js";
import {
  fixtureDesignSystem,
  fixtureIcons,
  fixtureTokens,
} from "../src/testing/index.js";

import { loginAst } from "./login.ast.js";

const ds = fixtureDesignSystem;
const show = (errors: readonly IRError[]): string[] =>
  errors.map((e) => `${e.code} ${e.path}`);

const screen = (root: Node): Screen => ({ name: "S", root });
const box = (props: Node["props"] & object, id = "b"): Node => ({
  type: "Box",
  id,
  props,
  overrides: [],
});
const image = (
  props: Extract<Node, { type: "Image" }>["props"],
  overrides: Extract<Node, { type: "Image" }>["overrides"] = [],
): Node => ({
  type: "Image",
  id: "img",
  props,
  overrides,
  content: { kind: "slot", name: "src" },
});

describe("typecheck de Login.ir contre le design system de fixture", () => {
  it("passe sans erreur", () => {
    expect(typecheck(loginAst, ds)).toStrictEqual([]);
  });

  it("attache les positions de parse aux erreurs", () => {
    const source =
      "screen S {\n  Stack #root (dir: v) {\n    Box #email (bg: $color.nope)\n  }\n}\n";
    const parsed = parse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const errors = typecheck(parsed.value.screen, ds, parsed.value.positions);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: "E002",
      path: "root/email",
      position: { line: 3, column: 5 },
    });
  });
});

describe("E002 — tokens, icônes et breakpoints", () => {
  it.each<[string, Node]>([
    ["token inconnu", box({ bg: { group: "color", path: ["nope"] } })],
    [
      "token inconnu dans une longueur",
      box({ maxW: { group: "size", path: ["giant"] } }),
    ],
    [
      "token inconnu dans fixed",
      box({ w: { kind: "fixed", value: { group: "size", path: ["giant"] } } }),
    ],
    [
      "token inconnu dans un tuple",
      box({
        border: [
          { group: "size", path: ["hairline"] },
          { group: "color", path: ["border", "nope"] },
        ],
      }),
    ],
    [
      "primitive non référençable (palette)",
      box({ bg: { group: "color", path: ["palette", "gray", "0"] } }),
    ],
    [
      "groupe non référençable (font) via un chemin $type.*",
      {
        type: "Text",
        id: "t",
        props: {
          style: { group: "type", path: ["nope"] },
          color: { group: "color", path: ["text", "primary"] },
        },
        overrides: [],
        content: { kind: "literal", value: "" },
      },
    ],
    [
      "icône inconnue",
      {
        type: "Icon",
        id: "i",
        props: {
          name: { group: "icon", path: ["nope"] },
          size: { group: "size", path: ["icon", "md"] },
          color: { group: "color", path: ["accent"] },
        },
        overrides: [],
      },
    ],
    [
      "token dans une surcharge",
      {
        type: "Box",
        id: "b",
        props: {},
        overrides: [
          {
            breakpoint: "expanded",
            props: { bg: { group: "color", path: ["nope"] } },
          },
        ],
      },
    ],
    [
      "breakpoint inconnu",
      {
        type: "Box",
        id: "b",
        props: {},
        overrides: [{ breakpoint: "tablet", props: { w: { kind: "fill" } } }],
      },
    ],
  ])("%s", (_label, node) => {
    const errors = typecheck(screen(node), ds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("E002");
    expect(errors[0]?.path).toBe(node.id);
  });

  it("type DTCG inattendu pour le groupe", () => {
    const odd = loadDesignSystem(
      {
        ...fixtureTokens,
        space: { $type: "color", md: { $value: { hex: "#000000" } } },
      },
      fixtureIcons,
    );
    expect(odd.ok).toBe(true);
    if (!odd.ok) return;
    const errors = typecheck(
      screen({
        type: "Stack",
        id: "s",
        props: { dir: "v", gap: { group: "space", path: ["md"] } },
        overrides: [],
        children: [],
      }),
      odd.value,
    );
    expect(show(errors)).toStrictEqual(["E002 s"]);
    expect(errors[0]?.message).toContain("dimension");
  });

  it("un même token fautif n'est signalé qu'une fois par nœud, et le chemin est celui du nœud", () => {
    const nope = { group: "color", path: ["nope"] } as const;
    const root: Node = {
      type: "Stack",
      id: "root",
      props: { dir: "v", bg: nope },
      overrides: [],
      children: [
        {
          type: "Stack",
          id: "form",
          props: { dir: "v" },
          overrides: [],
          children: [
            box(
              {
                bg: nope,
                border: [{ group: "size", path: ["hairline"] }, nope],
              },
              "email",
            ),
          ],
        },
      ],
    };
    expect(show(typecheck(screen(root), ds))).toStrictEqual([
      "E002 root",
      "E002 root/form/email",
    ]);
  });
});

describe("E006 — Image sans dimension résolvable (spec §4.5)", () => {
  const fill = { kind: "fill" } as const;
  const fixed = { kind: "fixed", value: 100 } as const;
  const hug = { kind: "hug" } as const;

  it.each<[string, Node]>([
    ["hug sur les deux axes", image({})],
    ["hug sur les deux axes malgré ratio", image({ ratio: [16, 9] })],
    ["w fill, h hug, sans ratio", image({ w: fill })],
    ["h fixed, w hug, sans ratio", image({ h: fixed })],
    [
      "résolvable à la base, plus en expanded",
      image({ w: fill, h: fixed }, [
        { breakpoint: "expanded", props: { h: hug } },
      ]),
    ],
  ])("%s", (_label, node) => {
    const errors = typecheck(screen(node), ds);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("E006");
    expect(errors[0]?.path).toBe("img");
  });

  it.each<[string, Node]>([
    ["fixed et fill", image({ w: fixed, h: fill })],
    ["w fill, h dérivé par ratio", image({ w: fill, ratio: [4, 3] })],
    ["h fixed, w dérivé par ratio", image({ h: fixed, ratio: [1, 1] })],
    [
      "hug à la base, résolu en expanded seulement : reste une erreur à la base",
      image({ h: fixed, ratio: [1, 1] }, [
        { breakpoint: "expanded", props: { w: fill } },
      ]),
    ],
  ])("%s passe", (_label, node) => {
    expect(typecheck(screen(node), ds)).toStrictEqual([]);
  });
});
