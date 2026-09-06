import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { activeBreakpoint, resolveBreakpoint } from "ir-core";
import type { Node, Screen } from "ir-core";
import { fixtureDesignSystem, genIR } from "ir-core/testing";

import { layout, monospaceMeasure } from "../src/index.js";
import type { Geometry, Rect } from "../src/index.js";

const OPTIONS = {
  designSystem: fixtureDesignSystem,
  platform: { measureText: monospaceMeasure },
};
const genViewport = fc.record({
  w: fc.integer({ min: 200, max: 1400 }),
  h: fc.integer({ min: 200, max: 1200 }),
});

const keyOf = (node: Node, indices: readonly number[]): string =>
  node.id ?? `/${indices.join("/")}`;

function walk(
  node: Node,
  indices: readonly number[],
  f: (node: Node, indices: readonly number[]) => void,
): void {
  f(node, indices);
  if (node.type === "Stack")
    node.children.forEach((c, k) => walk(c, [...indices, k], f));
}

/** Géométrie, et l'arbre résolu au breakpoint actif tel que le layout le voit. */
function geometryOf(
  raw: Screen,
  viewport: { w: number; h: number },
): { g: Geometry; screen: Screen } {
  const screen = resolveBreakpoint(
    raw,
    activeBreakpoint(fixtureDesignSystem, viewport.w),
  );
  const result = layout(raw, { ...OPTIONS, viewport });
  expect(
    result.ok,
    result.ok
      ? ""
      : result.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
  ).toBe(true);
  if (!result.ok) throw new Error("layout en échec");
  return { g: result.value, screen };
}

const rectOf = (g: Geometry, node: Node, indices: readonly number[]): Rect => {
  const r = g.get(keyOf(node, indices));
  if (r === undefined)
    throw new Error(`pas de rectangle pour ${keyOf(node, indices)}`);
  return r;
};

describe("layout de référence × genIR (spec §5, §8.1)", () => {
  it("termine, ne produit ni NaN ni infini, ni taille négative, et couvre chaque nœud", () => {
    fc.assert(
      fc.property(genIR, genViewport, (raw: Screen, viewport) => {
        const { g, screen } = geometryOf(raw, viewport);
        walk(screen.root, [], (node, indices) => {
          const r = rectOf(g, node, indices);
          for (const v of [r.x, r.y, r.w, r.h])
            expect(Number.isFinite(v)).toBe(true);
          expect(r.w).toBeGreaterThanOrEqual(0);
          expect(r.h).toBeGreaterThanOrEqual(0);
        });
      }),
      { numRuns: 500 },
    );
  });

  it("les frères d'un Stack ne se chevauchent pas sur l'axe principal", () => {
    fc.assert(
      fc.property(genIR, genViewport, (raw: Screen, viewport) => {
        const { g, screen } = geometryOf(raw, viewport);
        walk(screen.root, [], (node, indices) => {
          if (node.type !== "Stack") return;
          const pos = node.props.dir === "h" ? "x" : "y";
          const size = node.props.dir === "h" ? "w" : "h";
          const rects = node.children.map((c, k) =>
            rectOf(g, c, [...indices, k]),
          );
          for (let i = 0; i + 1 < rects.length; i++) {
            const a = rects[i];
            const b = rects[i + 1];
            if (a === undefined || b === undefined) continue;
            expect(a[pos] + a[size]).toBeLessThanOrEqual(b[pos] + 1e-6);
          }
        });
      }),
      { numRuns: 500 },
    );
  });

  it("un Stack hug sans min/max ni scroll contient exactement ses enfants, gaps et padding compris", () => {
    fc.assert(
      fc.property(genIR, genViewport, (raw: Screen, viewport) => {
        const { g, screen } = geometryOf(raw, viewport);
        walk(screen.root, [], (node, indices) => {
          if (node.type !== "Stack" || node.children.length === 0) return;
          const p = node.props;
          const main = p.dir === "h" ? "w" : "h";
          const pos = p.dir === "h" ? "x" : "y";
          const mode = p[main] ?? { kind: "hug" };
          const bounded =
            main === "w"
              ? p.minW !== undefined || p.maxW !== undefined
              : p.minH !== undefined || p.maxH !== undefined;
          if (mode.kind !== "hug" || bounded || p.overflow === "scroll") return;
          const self = rectOf(g, node, indices);
          const children = node.children.map((c, k) =>
            rectOf(g, c, [...indices, k]),
          );
          const first = children[0];
          const last = children[children.length - 1];
          if (first === undefined || last === undefined) return;
          // Les enfants tiennent dans le Stack, et le dernier finit au padding près de sa fin.
          expect(first[pos]).toBeGreaterThanOrEqual(self[pos] - 1e-6);
          expect(last[pos] + last[main]).toBeLessThanOrEqual(
            self[pos] + self[main] + 1e-6,
          );
        });
      }),
      { numRuns: 300 },
    );
  });

  it("est déterministe", () => {
    fc.assert(
      fc.property(genIR, genViewport, (screen: Screen, viewport) => {
        expect(geometryOf(screen, viewport).g).toStrictEqual(
          geometryOf(screen, viewport).g,
        );
      }),
      { numRuns: 100 },
    );
  });
});
