import * as fc from "fast-check";
import * as core from "ir-core";
import { genIR } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import * as self from "../src/index.js";

// T0 : ce test vérifie le câblage (Vitest, fast-check, dépendances workspace,
// sous-chemin ir-core/testing), pas un comportement. Il disparaît quand le
// package reçoit ses vrais tests.
describe("ir-layout-ref (bootstrap)", () => {
  it("expose un module", () => {
    expect(self).toBeTypeOf("object");
  });

  it("résout ir-core et ir-core/testing via le workspace", () => {
    expect(core.normalize).toBeTypeOf("function");
    fc.assert(
      fc.property(genIR, (ir) => {
        expect(core.ScreenSchema.safeParse(ir).success).toBe(true);
      }),
      { numRuns: 20 },
    );
  });
});
