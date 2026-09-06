import * as fc from "fast-check";
import { normalize } from "ir-core";
import type { Normalized, Screen } from "ir-core";
import { fixtureDesignSystem, genIR, genRawIR } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import { compileCss, decompileCss } from "../src/index.js";
import type { CssOutput } from "../src/index.js";

const ds = fixtureDesignSystem;

const compile = (screen: Screen): CssOutput => {
  const r = compileCss(screen, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
};

const decompile = (out: CssOutput): Normalized => {
  const r = decompileCss({ tsx: out.tsx, css: out.css }, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n") +
        `\n\n${out.css}\n\n${out.tsx}`,
    );
  return r.value;
};

const roundTrip = (screen: Screen): Normalized => decompile(compile(screen));

describe("loi 2 — decompile_css(compile_css(ir)) ≡ ir (spec §7)", () => {
  it("sur 1000 IR générées en forme normale, sans avertissement", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        const back = roundTrip(ir);
        expect(back.screen).toStrictEqual(ir);
        expect(back.warnings).toStrictEqual([]);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("loi 4 — commutation avec la forme normale (spec §7)", () => {
  it("compile(x) = compile(N(x)) à l'octet près, et rend les avertissements de N", () => {
    fc.assert(
      fc.property(genRawIR, (x: Screen) => {
        const n = normalize(x);
        const a = compile(x);
        const b = compile(n.screen);
        expect(a.tsx).toBe(b.tsx);
        expect(a.css).toBe(b.css);
        expect(a.stories).toBe(b.stories);
        expect(a.preserved).toBe(b.preserved);
        expect(a.warnings).toStrictEqual(n.warnings);
        expect(b.warnings).toStrictEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("decompile(compile(x)) ≡ N(x) pour toute IR bien typée, normale ou non", () => {
    fc.assert(
      fc.property(genRawIR, (x: Screen) => {
        expect(roundTrip(x).screen).toStrictEqual(normalize(x).screen);
      }),
      { numRuns: 300 },
    );
  });

  it("N(decompile(c)) ≡ decompile(c) : la sortie du décompilateur est normale", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        const back = roundTrip(ir).screen;
        expect(normalize(back).screen).toStrictEqual(back);
      }),
      { numRuns: 300 },
    );
  });
});
