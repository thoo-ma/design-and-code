import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parse, print } from "../src/index.js";
import type { IRError, Screen } from "../src/index.js";

import { genIR } from "./gen.js";

const show = (errors: readonly IRError[]): string =>
  errors.map((e) => `${e.code} ${e.path} : ${e.message}`).join("\n");

describe("loi 0 — syntaxe (spec §7)", () => {
  it("parse(print(ir)) ≡ ir sur 1000 arbres générés", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        const text = print(ir);
        const back = parse(text);
        expect(
          back.ok,
          back.ok ? "" : `${show(back.errors)}\n---\n${text}`,
        ).toBe(true);
        if (back.ok) expect(back.value.screen).toStrictEqual(ir);
      }),
      { numRuns: 1000 },
    );
  });

  it("print(parse(s)) est un point fixe du texte canonique", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        const once = print(ir);
        const back = parse(once);
        expect(back.ok).toBe(true);
        if (back.ok) expect(print(back.value.screen)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("le texte canonique est indenté de deux espaces et finit par un retour à la ligne", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        const text = print(ir);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.includes("\n\n")).toBe(false);
        for (const line of text.split("\n")) {
          const lead = line.length - line.trimStart().length;
          expect(lead % 2).toBe(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
