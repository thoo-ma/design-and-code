import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalize } from "../src/index.js";
import type { Node, Screen } from "../src/index.js";

import { genRawIR } from "./gen.js";

/**
 * Oracle indépendant de `normalize` : propriétés résolues d'un nœud à un
 * breakpoint, défauts de la spec §4 appliqués.
 */
const DEFAULTS: Readonly<Record<string, unknown>> = {
  w: { kind: "hug" },
  h: { kind: "hug" },
  role: { kind: "none" },
  gap: { group: "space", path: ["none"] },
  pad: { group: "space", path: ["none"] },
  mainAlign: "start",
  crossAlign: "start",
  overflow: "visible",
  align: "start",
  fit: "cover",
};

const KEYS = [
  "w",
  "h",
  "minW",
  "maxW",
  "minH",
  "maxH",
  "dir",
  "gap",
  "pad",
  "mainAlign",
  "crossAlign",
  "overflow",
  "bg",
  "radius",
  "border",
  "shadow",
  "opacity",
  "style",
  "color",
  "align",
  "maxLines",
  "truncate",
  "fit",
  "ratio",
  "name",
  "size",
  "role",
  "label",
] as const;

type Resolved = Readonly<Record<string, unknown>>;

/** Un objet de propriétés lu comme dictionnaire. */
const asRecord = (o: object): Resolved => o as Resolved;

function resolved(node: Node, bp: string): Resolved {
  const base = asRecord(node.props);
  const override = node.overrides.find((o) => o.breakpoint === bp);
  const eff: Resolved =
    override === undefined ? base : { ...base, ...asRecord(override.props) };
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (node.type === "Icon" && (key === "w" || key === "h")) continue;
    let v = eff[key] ?? DEFAULTS[key];
    if (key === "truncate" && v === undefined)
      v = eff["maxLines"] === undefined ? "none" : "end";
    if (key === "pad") v = reducePad(v);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function reducePad(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const s = v.map((t: unknown) => JSON.stringify(t));
  if (s.length === 4 && s[0] === s[2] && s[1] === s[3])
    return reducePad([v[0], v[1]]);
  if (s.length === 2 && s[0] === s[1]) return v[0];
  return v;
}

function breakpoints(screen: Screen): readonly string[] {
  const out = new Set<string>([""]);
  const walk = (n: Node): void => {
    for (const o of n.overrides) out.add(o.breakpoint);
    if (n.type === "Stack") n.children.forEach(walk);
  };
  walk(screen.root);
  return [...out];
}

/** Parcours parallèle de deux arbres de même structure. */
function zip(
  a: Node,
  b: Node,
  f: (a: Node, b: Node, parentA: Node | undefined) => void,
  parent?: Node,
): void {
  f(a, b, parent);
  if (a.type === "Stack" && b.type === "Stack") {
    expect(b.children).toHaveLength(a.children.length);
    a.children.forEach((child, k) => {
      const other = b.children[k];
      if (other !== undefined) zip(child, other, f, a);
    });
  }
}

describe("N préserve ce qu'elle doit préserver (spec §6)", () => {
  it("structure, contenu, sémantique et ids existants", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const { screen } = normalize(raw);
        expect(screen.name).toBe(raw.name);
        zip(raw.root, screen.root, (a, b) => {
          expect(b.type).toBe(a.type);
          if (a.id !== undefined) expect(b.id).toBe(a.id);
          if ("content" in a && "content" in b)
            expect(b.content).toStrictEqual(a.content);
          expect(b.props.role ?? { kind: "none" }).toStrictEqual(
            a.props.role ?? { kind: "none" },
          );
          expect(b.props.label).toStrictEqual(a.props.label);
        });
      }),
      { numRuns: 500 },
    );
  });

  it("les propriétés résolues à chaque breakpoint, sauf fill → hug de la règle 1", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const { screen } = normalize(raw);
        const bps = breakpoints(raw);
        zip(raw.root, screen.root, (a, b) => {
          for (const bp of bps) {
            const ra = resolved(a, bp);
            const rb = resolved(b, bp);
            for (const key of KEYS) {
              const same = JSON.stringify(ra[key]) === JSON.stringify(rb[key]);
              const rule1 =
                (key === "w" || key === "h") &&
                JSON.stringify(ra[key]) === JSON.stringify({ kind: "fill" }) &&
                JSON.stringify(rb[key]) === JSON.stringify({ kind: "hug" });
              expect(
                same || rule1,
                `${key} @${bp || "compact"} : ${JSON.stringify(ra[key])} → ${JSON.stringify(rb[key])}`,
              ).toBe(true);
            }
          }
        });
      }),
      { numRuns: 500 },
    );
  });

  it("après N, tout nœud a un id, unique et valide", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const { screen } = normalize(raw);
        const ids: string[] = [];
        const walk = (n: Node): void => {
          expect(n.id).toMatch(/^[A-Za-z_][A-Za-z0-9_-]*$/);
          if (n.id !== undefined) ids.push(n.id);
          if (n.type === "Stack") n.children.forEach(walk);
        };
        walk(screen.root);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 500 },
    );
  });

  it("chaque W001 correspond à un fill devenu hug, et réciproquement", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const { screen, warnings } = normalize(raw);
        let changes = 0;
        const bps = breakpoints(raw);
        zip(raw.root, screen.root, (a, b) => {
          for (const axis of ["w", "h"] as const) {
            const changed = bps.some(
              (bp) =>
                JSON.stringify(resolved(a, bp)[axis]) ===
                  JSON.stringify({ kind: "fill" }) &&
                JSON.stringify(resolved(b, bp)[axis]) ===
                  JSON.stringify({ kind: "hug" }),
            );
            if (changed) changes++;
          }
        });
        expect(warnings.filter((w) => w.code === "W001")).toHaveLength(changes);
        expect(
          warnings.every((w) => w.code === "W001" || w.code === "W003"),
        ).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
