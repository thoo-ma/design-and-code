import type {
  Node,
  Screen,
  StackNode,
  StackProps,
  TextNode,
  TextProps,
} from "ir-core";
import { fixtureDesignSystem } from "ir-core/testing";

import { layout, monospaceMeasure } from "../src/index.js";
import type { Geometry, LayoutOptions, Rect } from "../src/index.js";

export const sp = (name: string) => ({ group: "space", path: [name] }) as const;
export const fill = { kind: "fill" } as const;
export const hug = { kind: "hug" } as const;
export const fixed = (value: number) => ({ kind: "fixed", value }) as const;

export const stack = (
  id: string,
  props: StackProps,
  children: readonly Node[] = [],
  overrides: StackNode["overrides"] = [],
): StackNode => ({ type: "Stack", id, props, overrides, children });

export const box = (id: string, props: Node["props"] & object = {}): Node => ({
  type: "Box",
  id,
  props,
  overrides: [],
});

export const text = (
  id: string,
  value: string,
  props: Omit<TextProps, "style" | "color"> = {},
): TextNode => ({
  type: "Text",
  id,
  props: {
    style: { group: "type", path: ["body", "md"] },
    color: { group: "color", path: ["text", "primary"] },
    ...props,
  },
  overrides: [],
  content: { kind: "literal", value },
});

export const screen = (root: Node): Screen => ({ name: "S", root });

export function run(
  root: Node,
  viewport = { w: 300, h: 200 },
  extra: Partial<LayoutOptions> = {},
): Geometry {
  const result = layout(screen(root), {
    viewport,
    designSystem: fixtureDesignSystem,
    platform: { measureText: monospaceMeasure },
    ...extra,
  });
  if (!result.ok)
    throw new Error(
      result.errors.map((e) => `${e.code} ${e.path} : ${e.message}`).join("\n"),
    );
  return result.value;
}

export const rect = (g: Geometry, id: string): Rect => {
  const r = g.get(id);
  if (r === undefined) throw new Error(`pas de rectangle pour ${id}`);
  return r;
};
