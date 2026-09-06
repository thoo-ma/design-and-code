import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalize, parse, print } from "../src/index.js";
import type { IRError, Screen } from "../src/index.js";

import { genIR, genRawIR } from "../src/testing/index.js";

const show = (errors: readonly IRError[]): string =>
  errors.map((e) => `${e.code} ${e.path} : ${e.message}`).join("\n");

describe("loi 0 — syntaxe (spec §7)", () => {
  it("parse(print(ir)) ≡ ir sur 1000 arbres en forme normale", () => {
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

  it("parse(print(x)) = x aussi hors forme normale : print n'invente ni ne perd rien", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const back = parse(print(raw));
        expect(back.ok).toBe(true);
        if (back.ok) expect(back.value.screen).toStrictEqual(raw);
      }),
      { numRuns: 300 },
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

describe("loi 4 — normalisation, partie idempotence (spec §7)", () => {
  it("N(N(x)) ≡ N(x), sans nouvel avertissement au second passage", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const once = normalize(raw);
        const twice = normalize(once.screen);
        expect(twice.screen).toStrictEqual(once.screen);
        expect(twice.warnings).toStrictEqual([]);
      }),
      { numRuns: 1000 },
    );
  });

  it("N commute avec parse ∘ print : N(parse(print(x))) ≡ parse(print(N(x)))", () => {
    fc.assert(
      fc.property(genRawIR, (raw: Screen) => {
        const left = parse(print(raw));
        const right = parse(print(normalize(raw).screen));
        expect(left.ok && right.ok).toBe(true);
        if (left.ok && right.ok) {
          expect(normalize(left.value.screen).screen).toStrictEqual(
            right.value.screen,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});
