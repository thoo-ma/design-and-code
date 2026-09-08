import { normalize } from "ir-core";
import type { Node, Screen } from "ir-core";
import { fixtureDesignSystem } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import { compileSwift, decompileSwift } from "../src/index.js";

const ds = fixtureDesignSystem;

const stack = (id: string, props: object = {}, children: Node[] = []): Node =>
  ({ type: "Stack", id, props, overrides: [], children }) as Node;
const box = (id: string, props: object = {}): Node =>
  ({ type: "Box", id, props, overrides: [] }) as Node;
const screen = (root: Node, name = "S"): Screen => ({ name, root });

function decompile(gen: string) {
  const r = decompileSwift({ gen }, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
}

function compile(s: Screen): string {
  const r = compileSwift(s, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value.gen;
}

describe("motifs §11.2 (décompilation)", () => {
  it("Spacers en tête et queue → mainAlign: center (motif 2)", () => {
    const s = screen(
      stack("root", { dir: "v", h: { kind: "fill" }, mainAlign: "center" }, [
        box("a", {}),
      ]),
    );
    const back = decompile(compile(s));
    const root = back.screen.root as Extract<Node, { type: "Stack" }>;
    expect(root.props.mainAlign).toBe("center");
  });

  it("pas d'alignement + frames sur les enfants → crossAlign: stretch (motif 1)", () => {
    const s = screen(
      stack("root", { dir: "v", crossAlign: "stretch" }, [box("a", {})]),
    );
    const back = decompile(compile(s));
    const root = back.screen.root as Extract<Node, { type: "Stack" }>;
    expect(root.props.crossAlign).toBe("stretch");
  });

  it("sizeClass == .compact ? a : b → surcharge @expanded (motif 3)", () => {
    const s = screen(
      stack("root", { dir: "v", pad: { group: "space", path: ["md"] } }, []),
    );
    const root = s.root as Extract<Node, { type: "Stack" }>;
    const overridden = {
      ...root,
      overrides: [
        {
          breakpoint: "expanded",
          props: { pad: { group: "space", path: ["xl"] } },
        },
      ],
    } as Node;
    const back = decompile(compile(screen(overridden)));
    const got = back.screen.root as Extract<Node, { type: "Stack" }>;
    expect(got.overrides).toStrictEqual([
      {
        breakpoint: "expanded",
        props: { pad: { group: "space", path: ["xl"] } },
      },
    ]);
  });

  it("AnyLayout → surcharge @expanded(dir:) (motif 4)", () => {
    const root = stack("root", { dir: "v" }, [box("a", {})]);
    const overridden = {
      ...root,
      overrides: [{ breakpoint: "expanded", props: { dir: "h" } }],
    } as Node;
    const back = decompile(compile(screen(overridden)));
    const got = back.screen.root as Extract<Node, { type: "Stack" }>;
    expect(got.props.dir).toBe("v");
    expect(got.overrides).toStrictEqual([
      { breakpoint: "expanded", props: { dir: "h" } },
    ]);
  });
});

describe("erreurs de décompilation", () => {
  const header = (body: string): string =>
    `// Généré depuis S.ir par ir-backend-swiftui. Ne pas éditer : zone générée (spec §9).
import SwiftUI

struct SLayout: View {
  var body: some View {
${body}
  }
}
`;

  it("E003 : modificateur inconnu", () => {
    const gen = header(
      `    Text("x")\n      .font(T.type.body.md).foregroundStyle(T.color.text.primary)\n      .foo(1)\n      .irNode("t")\n`,
    );
    const r = decompileSwift({ gen }, { designSystem: ds });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "E003")).toBe(true);
  });

  it("E005 : .irNode dupliqué", () => {
    const gen = header(
      `    VStack(alignment: .leading) {\n      Text("x")\n        .font(T.type.body.md).foregroundStyle(T.color.text.primary)\n        .irNode("t")\n      Text("y")\n        .font(T.type.body.md).foregroundStyle(T.color.text.primary)\n        .irNode("t")\n    }\n    .irNode("root")\n`,
    );
    const r = decompileSwift({ gen }, { designSystem: ds });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "E005")).toBe(true);
  });

  it("E002 : token inconnu du design system", () => {
    const gen = header(
      `    Text("x")\n      .font(T.type.inconnu).foregroundStyle(T.color.text.primary)\n      .irNode("t")\n`,
    );
    const r = decompileSwift({ gen }, { designSystem: ds });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "E002")).toBe(true);
  });

  it("E003 : Spacer hors d'un Stack", () => {
    const gen = header(`    Spacer(minLength: 0)\n`);
    const r = decompileSwift({ gen }, { designSystem: ds });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe("E003");
  });

  it("le décompilateur rend la forme normale", () => {
    const s = screen(
      stack("root", { dir: "v", crossAlign: "start" }, [box("a", {})]),
    );
    const back = decompile(compile(s));
    expect(normalize(back.screen).screen).toStrictEqual(back.screen);
  });
});
