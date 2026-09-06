import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ScreenSchema } from "../src/index.js";
import type { Node, Screen } from "../src/index.js";

import { genIR } from "./gen.js";

const collectIds = (nodes: readonly Node[], out: string[] = []): string[] => {
  for (const n of nodes) {
    if (n.id !== undefined) out.push(n.id);
    if (n.type === "Stack") collectIds(n.children, out);
  }
  return out;
};

const depthOf = (nodes: readonly Node[]): number =>
  nodes.reduce(
    (max, n) =>
      Math.max(max, 1 + (n.type === "Stack" ? depthOf(n.children) : 0)),
    0,
  );

describe("schéma zod × genIR (spec §8.1)", () => {
  it("tout arbre bien typé est accepté et rendu à l'identique", () => {
    fc.assert(
      fc.property(genIR, (screen: Screen) => {
        const result = ScreenSchema.safeParse(screen);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toStrictEqual(screen);
      }),
      { numRuns: 500 },
    );
  });

  it("l'AST est du JSON : JSON.parse(JSON.stringify(x)) ≡ x", () => {
    fc.assert(
      fc.property(genIR, (screen: Screen) => {
        const json: unknown = JSON.parse(JSON.stringify(screen));
        const result = ScreenSchema.safeParse(json);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toStrictEqual(screen);
      }),
      { numRuns: 200 },
    );
  });

  it("genIR respecte ses bornes : ids uniques, profondeur ≤ 5, largeur ≤ 4", () => {
    fc.assert(
      fc.property(genIR, (screen: Screen) => {
        const ids = collectIds([screen.root]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(depthOf([screen.root])).toBeLessThanOrEqual(5 + 1);
        const widths: number[] = [];
        const walk = (nodes: readonly Node[]): void => {
          widths.push(nodes.length);
          for (const n of nodes) if (n.type === "Stack") walk(n.children);
        };
        walk([screen.root]);
        expect(Math.max(0, ...widths)).toBeLessThanOrEqual(4);
      }),
      { numRuns: 200 },
    );
  });

  it("une clé inconnue injectée n'importe où est rejetée", () => {
    fc.assert(
      fc.property(genIR, fc.nat(), (screen: Screen, seed: number) => {
        const nodes: Node[] = [];
        const walk = (list: readonly Node[]): void => {
          for (const n of list) {
            nodes.push(n);
            if (n.type === "Stack") walk(n.children);
          }
        };
        walk([screen.root]);
        fc.pre(nodes.length > 0);
        const victim = nodes[seed % nodes.length];
        expect(victim).toBeDefined();
        if (victim === undefined) return;
        const poisoned = JSON.parse(
          JSON.stringify(screen, (_key, value: unknown) =>
            value === victim
              ? { ...victim, props: { ...victim.props, unknownProp: 1 } }
              : value,
          ),
        ) as unknown;
        expect(ScreenSchema.safeParse(poisoned).success).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
