import { readFileSync } from "node:fs";

import * as fc from "fast-check";
import { normalize, parse, typecheck } from "ir-core";
import type { Content, Node, Screen, StackProps } from "ir-core";
import { fixtureDesignSystem, genIR } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import {
  attr,
  classAccess,
  compileCss,
  componentName,
  diffDeclarations,
  jsxText,
} from "../src/index.js";
import type { CssOutput } from "../src/index.js";

const ds = fixtureDesignSystem;
const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const compile = (
  screen: Screen,
  samples?: Readonly<Record<string, string>>,
): CssOutput => {
  const r = compileCss(screen, {
    designSystem: ds,
    ...(samples === undefined ? {} : { samples }),
  });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
};

const stack = (
  id: string,
  props: StackProps,
  children: readonly Node[] = [],
): Node => ({ type: "Stack", id, props, overrides: [], children });
const box = (id: string, props: Node["props"] & object = {}): Node => ({
  type: "Box",
  id,
  props,
  overrides: [],
});
const text = (id: string, content: Content, extra: object = {}): Node => ({
  type: "Text",
  id,
  props: {
    style: { group: "type", path: ["body", "md"] },
    color: { group: "color", path: ["text", "primary"] },
    ...extra,
  },
  overrides: [],
  content,
});
const screen = (root: Node, name = "S"): Screen => ({ name, root });
const cssRule = (css: string, id: string): string => {
  const m = new RegExp(`^\\.${id} \\{\\n([\\s\\S]*?)\\n\\}`, "m").exec(css);
  return m?.[1] ?? "";
};

describe("golden : Login (spec §10.2, §9.1)", () => {
  const parsed = parse(read("../../../examples/Login.ir"));
  if (!parsed.ok) throw new Error("Login.ir ne parse pas");
  const login = normalize(parsed.value.screen).screen;
  const out = compile(login, { subtitle: "Connectez-vous pour continuer" });

  it("typecheck sans erreur", () => {
    expect(typecheck(login, ds)).toStrictEqual([]);
  });

  it.each<[keyof CssOutput["files"], string]>([
    ["tsx", "../../../examples/Login.gen.tsx"],
    ["css", "../../../examples/Login.gen.module.css"],
    ["stories", "../../../examples/Login.stories.tsx"],
    ["preserved", "../../../examples/Login.tsx"],
  ])("%s reproduit le fichier attendu à l'octet près", (key, path) => {
    expect(out[key]).toBe(read(path));
  });

  it("les extraits du §10.2 de la spec sont des extraits verbatim de la sortie", () => {
    const spec = read("../../../docs/spec-ir-v0.md");
    const section = spec.slice(
      spec.indexOf("### 10.2 Sortie CSS"),
      spec.indexOf("### 10.3 Sortie SwiftUI"),
    );
    const blocks = [...section.matchAll(/```(css|tsx)\n([\s\S]*?)```/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      const generated = block[1] === "css" ? out.css : out.tsx;
      expect(
        generated.includes(block[2] ?? ""),
        `extrait ${block[1] ?? ""} absent de la sortie :\n${block[2] ?? ""}`,
      ).toBe(true);
    }
  });
});

describe("table §11.1 : dimensions", () => {
  const fill = { kind: "fill" } as const;
  const fixed = (n: number) => ({ kind: "fixed", value: n }) as const;

  it("racine : 100 %, fit-content ou px, toujours émis", () => {
    expect(
      cssRule(compile(screen(stack("root", { dir: "v" }))).css, "root"),
    ).toBe(
      "  display: flex;\n  flex-direction: column;\n  width: fit-content;\n  height: fit-content;\n  align-items: flex-start;",
    );
    expect(
      cssRule(
        compile(screen(box("root", { w: fill, h: fixed(10) }))).css,
        "root",
      ),
    ).toBe("  width: 100%;\n  height: 10px;");
  });

  it("enfant : fixed sur main ajoute flex-shrink: 0 ; hug sur main flex: 0 0 auto ; fill sur main flex + min-width: 0 ; fill sur cross align-self", () => {
    const css = compile(
      screen(
        stack("root", { dir: "h", w: fill, h: fill }, [
          box("a", { w: fixed(10), h: fixed(20) }),
          box("b", { w: fill, h: fill }),
          box("c", {}),
        ]),
      ),
    ).css;
    expect(cssRule(css, "a")).toBe(
      "  width: 10px;\n  flex-shrink: 0;\n  height: 20px;",
    );
    expect(cssRule(css, "b")).toBe(
      "  flex: 1 1 0;\n  min-width: 0;\n  align-self: stretch;",
    );
    expect(cssRule(css, "c")).toBe("  flex: 0 0 auto;");
  });

  it("en colonne, fill sur main donne min-height: 0 et fixed reste sans flex-shrink sur cross", () => {
    const css = compile(
      screen(
        stack("root", { dir: "v", w: fill, h: fill }, [
          box("a", { w: fixed(10), h: fill }),
        ]),
      ),
    ).css;
    expect(cssRule(css, "a")).toBe(
      "  width: 10px;\n  flex: 1 1 0;\n  min-height: 0;",
    );
  });

  it("fixed par token et contraintes", () => {
    const css = compile(
      screen(
        stack("root", { dir: "v", w: fill, h: fill }, [
          box("a", {
            w: {
              kind: "fixed",
              value: { group: "size", path: ["icon", "md"] },
            },
            minH: 8,
            maxW: { group: "size", path: ["icon", "lg"] },
          }),
        ]),
      ),
    ).css;
    expect(cssRule(css, "a")).toBe(
      "  width: var(--size-icon-md);\n  flex: 0 0 auto;\n  max-width: var(--size-icon-lg);\n  min-height: 8px;",
    );
  });
});

describe("table §11.1 : Stack, style, Text, Image, Icon", () => {
  it("align-items toujours émis, justify-content omis pour start, overflow", () => {
    const css = compile(
      screen(
        stack("root", {
          dir: "h",
          overflow: "scroll",
          mainAlign: "between",
          crossAlign: "center",
          pad: [
            { group: "space", path: ["xs"] },
            { group: "space", path: ["sm"] },
          ],
          gap: { group: "space", path: ["md"] },
        }),
      ),
    ).css;
    expect(cssRule(css, "root")).toContain(
      "  padding: var(--space-xs) var(--space-sm);\n  gap: var(--space-md);\n  justify-content: space-between;\n  align-items: center;\n  overflow-x: auto;",
    );
    expect(
      cssRule(
        compile(screen(stack("root", { dir: "v", overflow: "clip" }))).css,
        "root",
      ),
    ).toContain("  align-items: flex-start;\n  overflow: hidden;");
  });

  it("Text : composes, color, text-align, maxLines avec ellipse ou coupe nette", () => {
    const css = compile(
      screen(
        stack("root", { dir: "v" }, [
          text(
            "a",
            { kind: "literal", value: "x" },
            { align: "center", maxLines: 2 },
          ),
          text(
            "b",
            { kind: "literal", value: "x" },
            { maxLines: 3, truncate: "none" },
          ),
        ]),
      ),
    ).css;
    expect(cssRule(css, "a")).toBe(
      "  composes: type-body-md from global;\n  flex: 0 0 auto;\n  color: var(--color-text-primary);\n  text-align: center;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;",
    );
    expect(cssRule(css, "b")).toContain(
      "  overflow: hidden;\n  max-height: calc(3 * 1.5em);",
    );
  });

  it("Text : élément selon le rôle et le parent", () => {
    const tsx = compile(
      screen(
        stack("root", { dir: "v" }, [
          text(
            "h",
            { kind: "literal", value: "Titre" },
            { role: { kind: "heading", level: 2 } },
          ),
          stack("btn", { dir: "h", role: { kind: "button" } }, [
            text("l", { kind: "literal", value: "Ok" }),
          ]),
          text("p", { kind: "literal", value: "Corps" }),
        ]),
      ),
    ).tsx;
    expect(tsx).toContain(`<h2 className={s.h} data-ir="h">Titre</h2>`);
    expect(tsx).toContain(
      `<div className={s.btn} data-ir="btn" role="button">`,
    );
    expect(tsx).toContain(`<span className={s.l} data-ir="l">Ok</span>`);
    expect(tsx).toContain(`<p className={s.p} data-ir="p">Corps</p>`);
  });

  it("rôles, labels, décoratif, Image et Icon", () => {
    const img: Node = {
      type: "Image",
      id: "img",
      props: {
        w: { kind: "fill" },
        ratio: [4, 3],
        fit: "contain",
        label: "Photo",
        radius: { group: "radius", path: ["md"] },
      },
      overrides: [],
      content: { kind: "literal", value: "/a.png" },
    };
    const slotImg: Node = {
      type: "Image",
      id: "photo",
      props: { w: { kind: "fill" }, h: { kind: "fixed", value: 100 } },
      overrides: [],
      content: { kind: "slot", name: "photo" },
    };
    const icon: Node = {
      type: "Icon",
      id: "i",
      props: {
        name: { group: "icon", path: ["chevron-right"] },
        size: { group: "size", path: ["icon", "sm"] },
        color: { group: "color", path: ["accent"] },
        role: { kind: "decorative" },
      },
      overrides: [],
    };
    const list = stack("list", { dir: "v", role: { kind: "list" } }, [
      box("item", { role: { kind: "listitem" }, label: "Un" }),
      box("field", { role: { kind: "textfield" } }),
      box("pic", { role: { kind: "image" } }),
    ]);
    const out = compile(
      screen(
        stack("root", { dir: "v", w: { kind: "fill" } }, [
          img,
          slotImg,
          icon,
          list,
        ]),
      ),
    );
    expect(out.tsx).toContain(
      `<img className={s.img} data-ir="img" src="/a.png" alt="Photo" />`,
    );
    expect(out.tsx).toContain(
      `<img className={s.photo} data-ir="photo" src={photo.src} alt={photo.alt ?? ""} />`,
    );
    expect(out.tsx).toContain(
      `<Icon name="chevron-right" className={s.i} data-ir="i" aria-hidden="true" />`,
    );
    expect(out.tsx).toContain(
      `<div className={s.list} data-ir="list" role="list">`,
    );
    expect(out.tsx).toContain(
      `<div className={s.item} data-ir="item" role="listitem" aria-label="Un" />`,
    );
    expect(out.tsx).toContain(`role="textbox"`);
    expect(out.tsx).toContain(`role="img"`);
    expect(out.tsx).toContain(
      `export function SLayout({ photo }: { photo: ImageSource })`,
    );
    expect(out.tsx).toContain(
      `import type { ImageSource } from "./ir-support";`,
    );
    expect(cssRule(out.css, "img")).toBe(
      "  align-self: stretch;\n  flex: 0 0 auto;\n  object-fit: contain;\n  aspect-ratio: 4 / 3;\n  border-radius: var(--radius-md);",
    );
    expect(cssRule(out.css, "i")).toBe(
      "  width: var(--size-icon-sm);\n  height: var(--size-icon-sm);\n  flex-shrink: 0;\n  color: var(--color-accent);",
    );
    expect(out.stories).toContain(`args: { photo: { src: "photo" } },`);
    expect(out.preserved).toContain(`<SLayout photo={{ src: "photo" }} />`);
  });

  it("surcharge : un bloc @media avec les déclarations qui changent, revert pour celles qui disparaissent", () => {
    const root: Node = {
      type: "Stack",
      id: "root",
      props: {
        dir: "v",
        w: { kind: "fill" },
        h: { kind: "fill" },
        overflow: "scroll",
        pad: { group: "space", path: ["md"] },
      },
      overrides: [
        {
          breakpoint: "expanded",
          props: { dir: "h", pad: { group: "space", path: ["xl"] }, maxW: 480 },
        },
      ],
      children: [
        box("a", { w: { kind: "fill" }, h: { kind: "fixed", value: 10 } }),
      ],
    };
    const css = compile(screen(root)).css;
    expect(css).toContain(
      "@media (min-width: 600px) {\n  .root {\n    flex-direction: row;\n    max-width: 480px;\n    padding: var(--space-xl);\n    overflow-x: auto;\n    overflow-y: revert;\n  }\n}",
    );
    expect(css).toContain(
      "@media (min-width: 600px) {\n  .a {\n    flex: 1 1 0;\n    min-width: 0;\n    align-self: revert;\n    flex-shrink: revert;\n  }\n}",
    );
  });

  it("noms : accès par crochets pour un id non identifiant, texte JSX échappé, composant en PascalCase", () => {
    expect(classAccess("chevron-right")).toBe(`s["chevron-right"]`);
    expect(classAccess("root")).toBe("s.root");
    expect(jsxText("Bienvenue")).toBe("Bienvenue");
    expect(jsxText("a {b}")).toBe(`{"a {b}"}`);
    expect(jsxText(" x")).toBe(`{" x"}`);
    expect(jsxText("")).toBe(`{""}`);
    expect(attr('a"b')).toBe(`{"a\\"b"}`);
    expect(componentName("my-screen")).toBe("MyScreenLayout");
    expect(
      diffDeclarations(
        [
          ["a", "1"],
          ["b", "2"],
        ],
        [
          ["a", "1"],
          ["c", "3"],
        ],
      ),
    ).toStrictEqual([
      ["c", "3"],
      ["b", "revert"],
    ]);
  });

  it("E002 : icône sans nom web ; E004 : slot utilisé avec deux types", () => {
    const noWeb = {
      ...ds,
      icons: new Map([["help", { ios: "questionmark.circle" }]]),
    };
    const icon: Node = {
      type: "Icon",
      id: "i",
      props: {
        name: { group: "icon", path: ["help"] },
        size: { group: "size", path: ["icon", "sm"] },
        color: { group: "color", path: ["accent"] },
      },
      overrides: [],
    };
    const r1 = compileCss(screen(stack("root", { dir: "v" }, [icon])), {
      designSystem: noWeb,
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok)
      expect(r1.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E002 root/i",
      ]);
    const img: Node = {
      type: "Image",
      id: "img",
      props: { w: { kind: "fill" }, h: { kind: "fixed", value: 1 } },
      overrides: [],
      content: { kind: "slot", name: "x" },
    };
    const r2 = compileCss(
      screen(
        stack("root", { dir: "v" }, [
          text("t", { kind: "slot", name: "x" }),
          img,
        ]),
      ),
      { designSystem: ds },
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok)
      expect(r2.errors.map((e) => `${e.code} ${e.path}`)).toStrictEqual([
        "E004 root/img",
      ]);
  });
});

describe("propriétés (spec §8.1)", () => {
  const ids = (node: Node, out: string[] = []): string[] => {
    if (node.id !== undefined) out.push(node.id);
    if (node.type === "Stack") node.children.forEach((c) => ids(c, out));
    return out;
  };

  it("chaque nœud a exactement une règle CSS et un data-ir ; les slots sont les props ; sortie déterministe", () => {
    fc.assert(
      fc.property(genIR, (screen: Screen) => {
        const out = compile(screen);
        for (const id of ids(screen.root)) {
          expect(out.css.split(`\n.${id} {\n`).length - 1).toBe(1);
          expect(
            out.tsx.split(`data-ir=${JSON.stringify(id)}`).length - 1,
          ).toBe(1);
        }
        expect(out.css.split("{").length).toBe(out.css.split("}").length);
        for (const text of [out.tsx, out.css, out.stories, out.preserved]) {
          expect(text).not.toContain("undefined");
          expect(text).not.toContain("NaN");
        }
        expect(compile(screen)).toStrictEqual(out);
      }),
      { numRuns: 300 },
    );
  });
});
