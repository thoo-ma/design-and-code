import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DIAGNOSTICS,
  ERROR_CODES,
  WARNING_CODES,
  irError,
  isErrorCode,
  severityOf,
} from "../src/index.js";
import type { DiagnosticCode, IRError } from "../src/index.js";

const ALL_CODES: readonly DiagnosticCode[] = [...ERROR_CODES, ...WARNING_CODES];

describe("codes de diagnostic (spec §12)", () => {
  it("exactement E001…E009 et W001…W003", () => {
    expectTypeOf<DiagnosticCode>().toEqualTypeOf<
      | "E001"
      | "E002"
      | "E003"
      | "E004"
      | "E005"
      | "E006"
      | "E007"
      | "E008"
      | "E009"
      | "W001"
      | "W002"
      | "W003"
    >();
    expect(ALL_CODES).toHaveLength(12);
    expect(Object.keys(DIAGNOSTICS).sort()).toEqual([...ALL_CODES].sort());
  });

  it("la sévérité suit le préfixe du code", () => {
    for (const code of ALL_CODES) {
      expect(severityOf(code)).toBe(code.startsWith("E") ? "error" : "warning");
      expect(isErrorCode(code)).toBe(code.startsWith("E"));
    }
  });

  it("chaque code a un message et au moins une étape", () => {
    for (const code of ALL_CODES) {
      expect(DIAGNOSTICS[code].summary.length).toBeGreaterThan(0);
      expect(DIAGNOSTICS[code].stages.length).toBeGreaterThan(0);
    }
  });
});

describe("IRError", () => {
  it.each(ALL_CODES)("%s est constructible", (code) => {
    const e: IRError = irError(
      code,
      "root/form/email",
      DIAGNOSTICS[code].summary,
    );
    expect(e).toStrictEqual({
      code,
      path: "root/form/email",
      message: DIAGNOSTICS[code].summary,
    });
    expect("position" in e).toBe(false);
  });

  it("porte la position quand elle est fournie", () => {
    const e = irError(
      "E004",
      "root",
      "Retirer `gap` : Box n'a pas de layout.",
      {
        line: 12,
        column: 7,
      },
    );
    expect(e.position).toStrictEqual({ line: 12, column: 7 });
  });

  it("est une valeur, pas une exception", () => {
    const e = irError("E001", "root", "Remplacer 8 par un token $space.*.");
    expect(e).not.toBeInstanceOf(Error);
  });
});
