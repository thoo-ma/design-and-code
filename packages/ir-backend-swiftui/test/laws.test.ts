import * as fc from "fast-check";
import { BASE_BREAKPOINT, normalize, resolveBreakpoint } from "ir-core";
import type { DesignSystem, Normalized, Node, Screen } from "ir-core";
import { fixtureDesignSystem, genIR, genRawIR } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import { compileSwift, decompileSwift } from "../src/index.js";
import type { SwiftOutput } from "../src/index.js";

const ds = fixtureDesignSystem;
const HUG = { kind: "hug" as const };

const compile = (screen: Screen): SwiftOutput => {
  const r = compileSwift(screen, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
};

const decompile = (out: SwiftOutput): Normalized => {
  const r = decompileSwift({ gen: out.gen }, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n") +
        `\n\n${out.gen}`,
    );
  return r.value;
};

const roundTrip = (screen: Screen): Normalized => decompile(compile(screen));

/**
 * Fragment non représentable dans le sous-ensemble SwiftUI §11.2 — la loi 2 ne
 * porte que sur le fragment représentable (ADR-002). Documenté dans §11.2
 * « Limites v0 » :
 * - rôles textfield / list / listitem (aucun trait SwiftUI correspondant) ;
 * - `mainAlign` hors `start` sur un axe principal non `fill` (Spacers réservés
 *   aux Stack `fill`, §11.2). Les no-ops — `hug`, 0 enfant, `between` < 2 —
 *   sont déjà effacés par la règle 1 bis de §6, et `fill` sous `stretch` par la
 *   règle 1 étendue.
 */
function nodeRepresentable(node: Node): boolean {
  const role = node.props.role;
  if (
    role?.kind === "textfield" ||
    role?.kind === "list" ||
    role?.kind === "listitem"
  )
    return false;
  // Le trait .isHeader ne porte pas de niveau (§11.2) : seul heading(1) survit.
  if (role?.kind === "heading" && role.level !== 1) return false;
  if (node.type !== "Stack") return true;
  const stack = node;
  // Spacers émis seulement sur un axe principal `fill` ; les no-ops (`hug`,
  // 0 enfant, `between` < 2) sont déjà effacés par N (règle 1 bis).
  const mainAxis: "w" | "h" = (stack.props.dir ?? "v") === "v" ? "h" : "w";
  const main = stack.props[mainAxis] ?? HUG;
  if ((stack.props.mainAlign ?? "start") !== "start" && main.kind !== "fill")
    return false;
  return stack.children.every(nodeRepresentable);
}

/** Éléments structurels non ternaires : ScrollView/clipped, l'axe du ScrollView lié à `dir`, et `crossAlign: stretch` ↔ autre. */
function structurallyRepresentable(node: Node): boolean {
  for (const o of node.overrides) {
    if ("overflow" in o.props) return false;
    // Les Spacers (mainAlign) sont structurels : leur motif ne se conditionne pas.
    if ("mainAlign" in o.props) return false;
  }
  if (node.type === "Stack") {
    if ((node.props.overflow ?? "visible") === "scroll") {
      const dirOverride = node.overrides.some((o) => "dir" in o.props);
      if (dirOverride) return false; // l'axe du ScrollView ne se conditionne pas
    }
    const baseCross = node.props.crossAlign ?? "start";
    for (const o of node.overrides) {
      const c = (o.props as { crossAlign?: string }).crossAlign ?? baseCross;
      // « pas d'alignement » (stretch) ne se combine pas en ternaire avec un
      // alignement explicite : l'étirement passe par les frames des enfants.
      if ((c === "stretch") !== (baseCross === "stretch")) return false;
    }
  }
  return (
    node.type !== "Stack" || node.children.every(structurallyRepresentable)
  );
}

function representable(screen: Screen, designSystem: DesignSystem): boolean {
  if (!structurallyRepresentable(screen.root)) return false;
  const bps = [
    BASE_BREAKPOINT,
    ...[...designSystem.breakpoints.keys()].filter(
      (n) => n !== BASE_BREAKPOINT,
    ),
  ];
  return bps.every((bp) =>
    nodeRepresentable(resolveBreakpoint(screen, bp).root),
  );
}

describe("loi 2 — decompile_swiftui(compile_swiftui(ir)) ≡ ir (spec §7)", () => {
  it("sur 1000 IR générées en forme normale, sans avertissement", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        if (!representable(ir, ds)) return; // fragment non représentable
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
        if (!representable(x, ds)) return;
        const n = normalize(x);
        const a = compile(x);
        const b = compile(n.screen);
        expect(a.gen).toBe(b.gen);
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
        if (!representable(x, ds)) return;
        expect(roundTrip(x).screen).toStrictEqual(normalize(x).screen);
      }),
      { numRuns: 300 },
    );
  });

  it("N(decompile(c)) ≡ decompile(c) : la sortie du décompilateur est normale", () => {
    fc.assert(
      fc.property(genIR, (ir: Screen) => {
        if (!representable(ir, ds)) return;
        const back = roundTrip(ir).screen;
        expect(normalize(back).screen).toStrictEqual(back);
      }),
      { numRuns: 300 },
    );
  });
});
