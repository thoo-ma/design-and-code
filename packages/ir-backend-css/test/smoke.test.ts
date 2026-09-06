import * as fc from "fast-check";
import * as core from "ir-core";
import { describe, expect, it } from "vitest";

import * as self from "../src/index.js";

// T0 : ce test vérifie le câblage (Vitest, fast-check, dépendance workspace),
// pas un comportement. Il disparaît quand le package reçoit ses vrais tests.
describe("ir-backend-css (bootstrap)", () => {
  it("expose un module", () => {
    expect(self).toBeTypeOf("object");
  });

  it("résout ir-core via le workspace", () => {
    expect(core).toBeTypeOf("object");
  });

  it("fast-check est câblé", () => {
    fc.assert(fc.property(fc.integer(), (n) => Number.isInteger(n)));
  });
});
