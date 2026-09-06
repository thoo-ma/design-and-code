import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalize, typecheck } from "../src/index.js";
import type { Node, Screen, Token } from "../src/index.js";
import { fixtureDesignSystem, genIR, genRawIR } from "../src/testing/index.js";

const ds = fixtureDesignSystem;

describe("typecheck × genIR (spec §8.1)", () => {
  it("tout arbre brut typecheck sans erreur", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        expect(typecheck(raw, ds)).toStrictEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("après N, la seule erreur que N peut révéler est E006 (fill d'Image éliminé par la règle 1)", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const errors = typecheck(normalize(raw).screen, ds);
        expect(errors.every((e) => e.code === "E006")).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("tout arbre en forme normale (genIR) typecheck sans erreur", () => {
    fc.assert(
      fc.property(genIR, (screen: Screen) => {
        expect(typecheck(screen, ds)).toStrictEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("un token remplacé par un nom inconnu donne exactement une E002, au chemin du nœud", () => {
    fc.assert(
      fc.property(genIR, fc.nat(), (screen: Screen, seed: number) => {
        const sites: { node: Node; path: string; token: Token }[] = [];
        const walk = (node: Node, parentPath: string): void => {
          const path =
            parentPath === ""
              ? (node.id ?? "")
              : `${parentPath}/${node.id ?? ""}`;
          const collect = (value: unknown): void => {
            if (typeof value === "object" && value !== null) {
              if (
                "group" in value &&
                "path" in value &&
                value.group !== "icon"
              ) {
                sites.push({ node, path, token: value as Token });
                return;
              }
              for (const v of Object.values(value)) collect(v);
            }
          };
          collect(node.props);
          for (const o of node.overrides) collect(o.props);
          if (node.type === "Stack")
            for (const child of node.children) walk(child, path);
        };
        walk(screen.root, "");
        fc.pre(sites.length > 0);
        const site = sites[seed % sites.length];
        if (site === undefined) return;
        const poisoned = JSON.parse(
          JSON.stringify(screen, (_k, v: unknown) =>
            v === site.token
              ? { group: site.token.group, path: ["__inconnu__"] }
              : v,
          ),
        ) as Screen;
        const errors = typecheck(poisoned, ds);
        expect(errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
          `E002 ${site.path}`,
        ]);
      }),
      { numRuns: 300 },
    );
  });
});
