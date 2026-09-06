import { describe, expect, it } from "vitest";

import { ScreenSchema } from "../src/index.js";
import type { Node, Screen } from "../src/index.js";

import { loginAst } from "./login.ast.js";

/** Un Stack minimal valide, base des cas négatifs. */
const stack: Node = {
  type: "Stack",
  props: { dir: "v" },
  overrides: [],
  children: [],
};
const box: Node = { type: "Box", props: {}, overrides: [] };
const text: Node = {
  type: "Text",
  props: {
    style: { group: "type", path: ["body", "md"] },
    color: { group: "color", path: ["text", "primary"] },
  },
  overrides: [],
  content: { kind: "literal", value: "x" },
};
const icon: Node = {
  type: "Icon",
  props: {
    name: { group: "icon", path: ["help"] },
    size: { group: "size", path: ["icon", "md"] },
    color: { group: "color", path: ["text", "primary"] },
  },
  overrides: [],
};

const screenOf = (...children: unknown[]): unknown => ({ name: "S", children });

describe("AST de Login.ir (spec §10.1)", () => {
  it("typecheck comme Screen et passe le schéma sans modification", () => {
    const result = ScreenSchema.safeParse(loginAst);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toStrictEqual(loginAst);
  });

  it("survit à une sérialisation JSON (spec §3.3)", () => {
    const json: unknown = JSON.parse(JSON.stringify(loginAst));
    const result = ScreenSchema.safeParse(json);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toStrictEqual(loginAst);
  });
});

describe("schéma : ce qui est accepté", () => {
  it.each<[string, unknown]>([
    ["écran sans nœud", screenOf()],
    ["nœud sans #id", screenOf(stack)],
    ["Stack minimal", screenOf(stack)],
    ["Box sans propriété", screenOf(box)],
    [
      "Text avec slot",
      screenOf({ ...text, content: { kind: "slot", name: "s" } }),
    ],
    [
      "Icon avec contraintes et rôle",
      screenOf({
        ...icon,
        props: { ...icon.props, maxW: 32, role: { kind: "decorative" } },
      }),
    ],
    [
      "pad symétrique",
      screenOf({
        ...stack,
        props: {
          dir: "v",
          pad: [
            { group: "space", path: ["sm"] },
            { group: "space", path: ["md"] },
          ],
        },
      }),
    ],
    [
      "surcharge de layout et de style",
      screenOf({
        ...stack,
        overrides: [
          {
            breakpoint: "expanded",
            props: {
              dir: "h",
              maxW: 480,
              bg: { group: "color", path: ["accent"] },
            },
          },
        ],
      }),
    ],
  ])("%s", (_label, value) => {
    expect(ScreenSchema.safeParse(value).success).toBe(true);
  });
});

describe("schéma : ce qui est rejeté", () => {
  it.each<[string, unknown]>([
    ["clé inconnue sur l'écran", { name: "S", children: [], extra: 1 }],
    [
      "type de nœud inconnu",
      screenOf({ type: "Grid", props: {}, overrides: [] }),
    ],
    [
      "Box avec enfants (block réservé à Stack)",
      screenOf({ ...box, children: [] }),
    ],
    [
      "Box avec contenu (content réservé à Text/Image)",
      screenOf({ ...box, content: { kind: "literal", value: "" } }),
    ],
    [
      "Icon avec contenu",
      screenOf({ ...icon, content: { kind: "literal", value: "" } }),
    ],
    [
      "Text sans contenu",
      screenOf({ type: "Text", props: text.props, overrides: [] }),
    ],
    [
      "propriété invalide pour ce type (gap sur Box, E004)",
      screenOf({ ...box, props: { gap: { group: "space", path: ["sm"] } } }),
    ],
    [
      "Icon avec w (implicite, non exprimable)",
      screenOf({ ...icon, props: { ...icon.props, w: { kind: "fill" } } }),
    ],
    ["Stack sans dir", screenOf({ ...stack, props: {} })],
    [
      "Text sans style",
      screenOf({ ...text, props: { color: text.props.color } }),
    ],
    [
      "Icon sans size",
      screenOf({
        ...icon,
        props: { name: icon.props.name, color: icon.props.color },
      }),
    ],
    [
      "token du mauvais groupe (gap: $color.*)",
      screenOf({
        ...stack,
        props: { dir: "v", gap: { group: "color", path: ["accent"] } },
      }),
    ],
    [
      "token sans chemin",
      screenOf({
        ...stack,
        props: { dir: "v", gap: { group: "space", path: [] } },
      }),
    ],
    [
      "gap littéral (E001)",
      screenOf({ ...stack, props: { dir: "v", gap: 8 } }),
    ],
    [
      "pad de trois valeurs",
      screenOf({
        ...stack,
        props: {
          dir: "v",
          pad: [
            { group: "space", path: ["sm"] },
            { group: "space", path: ["sm"] },
            { group: "space", path: ["sm"] },
          ],
        },
      }),
    ],
    [
      "maxLines: 0",
      screenOf({ ...text, props: { ...text.props, maxLines: 0 } }),
    ],
    [
      "maxLines non entier",
      screenOf({ ...text, props: { ...text.props, maxLines: 1.5 } }),
    ],
    [
      "heading(0)",
      screenOf({
        ...text,
        props: { ...text.props, role: { kind: "heading", level: 0 } },
      }),
    ],
    ["rôle inconnu", screenOf({ ...box, props: { role: { kind: "link" } } })],
    [
      "mode de dimension inconnu",
      screenOf({ ...box, props: { w: { kind: "auto" } } }),
    ],
    [
      "fixed sans valeur",
      screenOf({ ...box, props: { w: { kind: "fixed" } } }),
    ],
    [
      "ratio non entier",
      screenOf({
        type: "Image",
        props: { ratio: [1.5, 1] },
        overrides: [],
        content: { kind: "slot", name: "img" },
      }),
    ],
    [
      "surcharge de role (non surchargeable, §4.7)",
      screenOf({
        ...box,
        overrides: [
          { breakpoint: "expanded", props: { role: { kind: "button" } } },
        ],
      }),
    ],
    [
      "surcharge de label",
      screenOf({
        ...box,
        overrides: [{ breakpoint: "expanded", props: { label: "x" } }],
      }),
    ],
    [
      "surcharge sans breakpoint",
      screenOf({ ...box, overrides: [{ props: {} }] }),
    ],
    ["overrides absent", screenOf({ type: "Box", props: {} })],
    ["#id vide", screenOf({ ...box, id: "" })],
    [
      "propriété à undefined (absent ≠ undefined)",
      screenOf({ ...box, props: { w: undefined } }),
    ],
  ])("%s", (_label, value) => {
    expect(ScreenSchema.safeParse(value).success).toBe(false);
  });
});

describe("types", () => {
  it("un Screen est un objet JSON plat, sans classe", () => {
    const s: Screen = { name: "S", children: [] };
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
  });
});
