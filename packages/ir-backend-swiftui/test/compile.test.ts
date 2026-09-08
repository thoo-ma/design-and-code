import { readFileSync } from "node:fs";

import { normalize, parse, typecheck } from "ir-core";
import type { Node, Screen } from "ir-core";
import { fixtureDesignSystem } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import {
  compileSwift,
  layoutName,
  swiftFileNames,
  swiftString,
  viewName,
} from "../src/index.js";
import type { SwiftOutput } from "../src/index.js";

const ds = fixtureDesignSystem;
const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const compile = (
  screen: Screen,
  samples?: Readonly<Record<string, string>>,
): SwiftOutput => {
  const r = compileSwift(screen, {
    designSystem: ds,
    ...(samples === undefined ? {} : { samples }),
  });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
};

const stack = (id: string, props: object = {}, children: Node[] = []): Node =>
  ({ type: "Stack", id, props, overrides: [], children }) as Node;
const box = (id: string, props: object = {}): Node =>
  ({ type: "Box", id, props, overrides: [] }) as Node;
const text = (id: string, content: string, props: object = {}): Node =>
  ({
    type: "Text",
    id,
    props: {
      style: { group: "type", path: ["body", "md"] },
      color: { group: "color", path: ["text", "primary"] },
      ...props,
    },
    overrides: [],
    content: { kind: "literal", value: content },
  }) as Node;
const screen = (root: Node, name = "S"): Screen => ({ name, root });

describe("golden : Login (spec §10.3, §9.2)", () => {
  const parsed = parse(read("../../../examples/Login.ir"));
  if (!parsed.ok) throw new Error("Login.ir ne parse pas");
  const login = normalize(parsed.value.screen).screen;
  const out = compile(login, { subtitle: "Connectez-vous pour continuer" });

  it("typecheck sans erreur", () => {
    expect(typecheck(login, ds)).toStrictEqual([]);
  });

  it.each<[keyof SwiftOutput["files"], string]>([
    ["gen", "../../../examples/LoginLayout.gen.swift"],
    ["preserved", "../../../examples/LoginView.swift"],
  ])("%s reproduit le fichier attendu à l'octet près", (key, path) => {
    expect(out[key]).toBe(read(path));
  });

  it("les trois motifs de §11.2 sont présents", () => {
    expect(out.gen).toContain("Spacer(minLength: 0)");
    expect(out.gen).toContain(".frame(maxWidth: .infinity)");
    expect(out.gen).toContain(
      ".padding(sizeClass == .compact ? T.space.lg : T.space.xl)",
    );
  });
});

describe("table §11.2 : Stack", () => {
  it("dir, gap, crossAlign center → VStack(alignment:, spacing:)", () => {
    const out = compile(
      screen(
        stack("root", {
          dir: "h",
          gap: { group: "space", path: ["sm"] },
          crossAlign: "center",
        }),
      ),
    );
    expect(out.gen).toContain(
      "HStack(alignment: .center, spacing: T.space.sm)",
    );
  });

  it("crossAlign stretch → pas d'alignement, frame sur les enfants hug", () => {
    const out = compile(
      screen(
        stack("root", { dir: "v", crossAlign: "stretch" }, [box("a", {})]),
      ),
    );
    expect(out.gen).toContain("VStack {");
    expect(out.gen).toContain("Rectangle()");
    expect(out.gen).toContain(".frame(maxWidth: .infinity)");
  });

  it("mainAlign center sur un Stack fill → une paire de Spacer", () => {
    const out = compile(
      screen(
        stack("root", { dir: "v", h: { kind: "fill" }, mainAlign: "center" }, [
          box("a", {}),
        ]),
      ),
    );
    const body = out.gen.slice(
      out.gen.indexOf("VStack("),
      out.gen.indexOf('.irNode("root")'),
    );
    expect(body.match(/Spacer\(minLength: 0\)/g)).toHaveLength(2);
  });

  it("overflow clip → .clipped()", () => {
    const out = compile(screen(stack("root", { dir: "v", overflow: "clip" })));
    expect(out.gen).toContain(".clipped()");
  });
});

describe("table §11.2 : feuilles", () => {
  it("Box : Rectangle/RoundedRectangle, fill(bg), frame, overlay(border)", () => {
    const out = compile(
      screen(
        box("a", {
          h: { kind: "fixed", value: 48 },
          bg: { group: "color", path: ["bg", "field"] },
          radius: { group: "radius", path: ["md"] },
          border: [
            { group: "size", path: ["hairline"] },
            { group: "color", path: ["border", "default"] },
          ],
        }),
      ),
    );
    expect(out.gen).toContain("RoundedRectangle(cornerRadius: T.radius.md)");
    expect(out.gen).toContain(".fill(T.color.bg.field)");
    expect(out.gen).toContain(".frame(height: 48)");
    expect(out.gen).toContain(
      ".overlay(RoundedRectangle(cornerRadius: T.radius.md).stroke(T.color.border.`default`, lineWidth: T.size.hairline))",
    );
  });

  it("Text : font+foregroundStyle, lineLimit, rôle heading", () => {
    const out = compile(
      screen(
        text("t", "Bonjour", {
          maxLines: 2,
          role: { kind: "heading", level: 1 },
        }),
      ),
    );
    expect(out.gen).toContain(
      ".font(T.type.body.md).foregroundStyle(T.color.text.primary)",
    );
    expect(out.gen).toContain(".lineLimit(2)");
    expect(out.gen).toContain(".accessibilityAddTraits(.isHeader)");
  });

  it("Icon : Image(systemName:).font(.system(size:))", () => {
    const out = compile(
      screen({
        type: "Icon",
        id: "i",
        props: {
          name: { group: "icon", path: ["help"] },
          size: { group: "size", path: ["icon", "md"] },
          color: { group: "color", path: ["text", "secondary"] },
        },
        overrides: [],
      } as Node),
    );
    expect(out.gen).toContain(
      "Image(systemName: T.icon.help).font(.system(size: T.size.icon.md))",
    );
    expect(out.gen).toContain(".foregroundStyle(T.color.text.secondary)");
  });

  it("surcharge dir → AnyLayout (motif 4)", () => {
    const root = stack("root", { dir: "v" }, [box("a", {})]);
    const overridden = {
      ...root,
      overrides: [{ breakpoint: "expanded", props: { dir: "h" } }],
    } as Node;
    const out = compile(screen(overridden));
    expect(out.gen).toContain("AnyLayout(sizeClass == .compact ?");
    expect(out.gen).toContain("VStackLayout");
    expect(out.gen).toContain("HStackLayout");
  });

  it("noms et chaînes", () => {
    expect(layoutName("my-screen")).toBe("MyScreenLayout");
    expect(viewName("login")).toBe("LoginView");
    expect(swiftFileNames("Login").gen).toBe("LoginLayout.gen.swift");
    expect(swiftString('a"b')).toBe('"a\\"b"');
  });
});

describe("erreurs", () => {
  it("E004 : nom de slot réservé", () => {
    const t: Node = {
      type: "Text",
      id: "t",
      props: {
        style: { group: "type", path: ["body", "md"] },
        color: { group: "color", path: ["text", "primary"] },
      },
      overrides: [],
      content: { kind: "slot", name: "body" },
    };
    const r = compileSwift(screen(stack("root", { dir: "v" }, [t])), {
      designSystem: ds,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E004 root/t",
      ]);
  });

  it("E002 : icône sans nom ios", () => {
    const noIos = { ...ds, icons: new Map([["help", { web: "help-circle" }]]) };
    const icon: Node = {
      type: "Icon",
      id: "i",
      props: {
        name: { group: "icon", path: ["help"] },
        size: { group: "size", path: ["icon", "md"] },
        color: { group: "color", path: ["accent"] },
      },
      overrides: [],
    };
    const r = compileSwift(screen(stack("root", { dir: "v" }, [icon])), {
      designSystem: noIos,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E002 root/i",
      ]);
  });
});
