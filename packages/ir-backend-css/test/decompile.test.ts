import { readFileSync } from "node:fs";

import { normalize, parse } from "ir-core";
import type {
  Content,
  Node,
  Normalized,
  Screen,
  StackProps,
  TextNode,
} from "ir-core";
import { fixtureDesignSystem } from "ir-core/testing";
import { describe, expect, it } from "vitest";

import { compileCss, decompileCss, parseCssModule } from "../src/index.js";

const ds = fixtureDesignSystem;
const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const loginTsx = read("../../../examples/Login.gen.tsx");
const loginCss = read("../../../examples/Login.gen.module.css");
const parsed = parse(read("../../../examples/Login.ir"));
if (!parsed.ok) throw new Error("Login.ir ne parse pas");
const login = normalize(parsed.value.screen).screen;

const decompile = (tsx: string, css: string): Normalized => {
  const r = decompileCss({ tsx, css }, { designSystem: ds });
  if (!r.ok)
    throw new Error(
      r.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n"),
    );
  return r.value;
};

const roundTrip = (screen: Screen): Normalized => {
  const c = compileCss(screen, { designSystem: ds });
  if (!c.ok) throw new Error(JSON.stringify(c.errors));
  return decompile(c.value.tsx, c.value.css);
};

/** Codes et chemins des erreurs d'une décompilation qui doit échouer. */
const failures = (tsx: string, css: string): string[] => {
  const r = decompileCss({ tsx, css }, { designSystem: ds });
  if (r.ok) throw new Error("la décompilation aurait dû échouer");
  return r.errors.map((e) => `${e.code} ${e.path}`);
};

/** Remplacement qui exige que l'ancre soit présente. */
const mutate = (text: string, from: string, to: string): string => {
  if (!text.includes(from)) throw new Error(`ancre absente : ${from}`);
  return text.replace(from, to);
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
const text = (
  id: string,
  extra: object = {},
  content: Content = { kind: "literal", value: "x" },
  overrides: TextNode["overrides"] = [],
): Node => ({
  type: "Text",
  id,
  props: {
    style: { group: "type", path: ["body", "md"] },
    color: { group: "color", path: ["text", "primary"] },
    ...extra,
  },
  overrides,
  content,
});
const fill = { kind: "fill" } as const;
const fixed = (n: number) => ({ kind: "fixed", value: n }) as const;

describe("golden : Login (spec §9.1, §10.2)", () => {
  it("decompile(Login.gen.tsx, Login.gen.module.css) ≡ N(parse(Login.ir))", () => {
    const back = decompile(loginTsx, loginCss);
    expect(back.screen).toStrictEqual(login);
    expect(back.warnings).toStrictEqual([]);
  });

  it("le module CSS se lit comme un dictionnaire par règle, avec ses blocs @media", () => {
    const r = parseCssModule(loginCss);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.value.rules.keys()]).toStrictEqual([
      "root",
      "title",
      "subtitle",
      "form",
      "email",
      "password",
      "actions",
      "primary",
      "primaryLabel",
      "help",
    ]);
    expect(r.value.rules.get("primary")?.get("flex")).toBe("1 1 0");
    expect([
      ...(r.value.media.get(600)?.get("root")?.entries() ?? []),
    ]).toStrictEqual([
      ["max-width", "480px"],
      ["padding", "var(--space-xl)"],
    ]);
  });
});

describe("formes lues (spec §9.1, §11.1)", () => {
  it("le nom de l'écran est celui du module CSS importé, tirets compris", () => {
    const screen: Screen = {
      name: "my-screen",
      root: stack("root", { dir: "v" }),
    };
    expect(roundTrip(screen).screen.name).toBe("my-screen");
  });

  it.each<[string, Screen]>([
    [
      "fill sur l'axe principal avec minW, et minW: 0 distinct du repli",
      {
        name: "S",
        root: stack("root", { dir: "h", w: fill, h: fill }, [
          box("a", { w: fill, minW: 5 }),
          box("b", { w: fill, minW: 0 }),
          box("c", { w: fill, minW: { group: "size", path: ["icon", "md"] } }),
        ]),
      },
    ],
    [
      "maxH avec maxLines et truncate none, avec ellipse, sans maxLines",
      {
        name: "S",
        root: stack("root", { dir: "v", w: fill, h: fill }, [
          text("a", { maxLines: 3, truncate: "none", maxH: 40 }),
          text("b", { maxLines: 2, maxH: 40 }),
          text("c", { maxH: 40 }),
          text("d", { maxLines: 4, truncate: "none" }),
        ]),
      },
    ],
    [
      "heading sur un nœud autre qu'un Text, et sous un bouton",
      {
        name: "S",
        root: stack("root", { dir: "v" }, [
          box("a", { role: { kind: "heading", level: 2 }, label: "Titre" }),
          stack("btn", { dir: "h", role: { kind: "button" } }, [
            text("l", { role: { kind: "heading", level: 3 } }),
            text("m"),
          ]),
        ]),
      },
    ],
    [
      "Image à slot avec label de repli, Image littérale avec et sans label",
      {
        name: "S",
        root: stack("root", { dir: "v", w: fill }, [
          {
            type: "Image",
            id: "a",
            props: { w: fill, h: fixed(100), label: "Photo « 1 »" },
            overrides: [],
            content: { kind: "slot", name: "Iphoto" },
          },
          {
            type: "Image",
            id: "b",
            props: {
              w: fill,
              h: fixed(100),
              label: "Logo",
              role: { kind: "image" },
            },
            overrides: [],
            content: { kind: "literal", value: '/a b".png' },
          },
          {
            type: "Image",
            id: "c",
            props: { w: fixed(10), ratio: [4, 3], fit: "contain" },
            overrides: [],
            content: { kind: "literal", value: "x" },
          },
        ]),
      },
    ],
    [
      "contenu littéral difficile : accolades, chevrons, espaces en bord, vide",
      {
        name: "S",
        root: stack("root", { dir: "v" }, [
          text("a", {}, { kind: "literal", value: "a {b} <c> & d" }),
          text("b", {}, { kind: "literal", value: " x " }),
          text("c", {}, { kind: "literal", value: "" }),
          text("d", {}, { kind: "literal", value: 'dit "oui" }' }),
          text("e", { label: 'l"}' }, { kind: "slot", name: "msg" }),
        ]),
      },
    ],
    [
      "surcharge qui change l'axe du parent, le mode des enfants et le défilement",
      {
        name: "S",
        root: {
          type: "Stack",
          id: "root",
          props: {
            dir: "v",
            w: fill,
            h: fill,
            overflow: "scroll",
            mainAlign: "center",
          },
          overrides: [
            {
              breakpoint: "expanded",
              props: { dir: "h", mainAlign: "start", crossAlign: "stretch" },
            },
          ],
          children: [
            {
              type: "Box",
              id: "a",
              props: { w: fill, h: fixed(10), minW: 4 },
              overrides: [
                { breakpoint: "expanded", props: { w: fixed(20), h: fill } },
              ],
            },
            {
              type: "Text",
              id: "t",
              props: {
                style: { group: "type", path: ["body", "md"] },
                color: { group: "color", path: ["text", "primary"] },
                maxLines: 2,
              },
              overrides: [
                {
                  breakpoint: "expanded",
                  props: { truncate: "none", maxLines: 3 },
                },
              ],
              content: { kind: "literal", value: "x" },
            },
            {
              type: "Icon",
              id: "i",
              props: {
                name: { group: "icon", path: ["chevron-right"] },
                size: { group: "size", path: ["icon", "sm"] },
                color: { group: "color", path: ["accent"] },
                role: { kind: "decorative" },
              },
              overrides: [
                {
                  breakpoint: "expanded",
                  props: { size: { group: "size", path: ["icon", "lg"] } },
                },
              ],
            },
          ],
        },
      },
    ],
  ])("%s", (_label, screen) => {
    const expected = normalize(screen).screen;
    expect(roundTrip(screen).screen).toStrictEqual(expected);
  });

  it("truncate: none écrit à la base pour une surcharge qui ajoute maxLines revient sous sa forme normale", () => {
    const screen: Screen = {
      name: "S",
      root: text("t", { truncate: "none" }, undefined, [
        { breakpoint: "expanded", props: { maxLines: 3 } },
      ]),
    };
    const expected = normalize(screen).screen;
    expect(expected.root.props).not.toHaveProperty("truncate");
    expect(roundTrip(screen).screen).toStrictEqual(expected);
  });

  it("label vide : le code ne le distingue pas de l'absence, N non plus", () => {
    const screen: Screen = {
      name: "S",
      root: stack("root", { dir: "v", label: "" }, [box("a", { label: "" })]),
    };
    expect(roundTrip(screen).screen).toStrictEqual(normalize(screen).screen);
  });
});

describe("erreurs : le décompilateur ne devine jamais (spec §9.1, §12)", () => {
  it("E002 : token, icône ou seuil inconnus du design system", () => {
    expect(
      failures(
        loginTsx,
        mutate(loginCss, "var(--color-text-primary)", "var(--color-nope)"),
      ),
    ).toStrictEqual(["E002 root/title"]);
    expect(
      failures(mutate(loginTsx, 'name="help-circle"', 'name="nope"'), loginCss),
    ).toStrictEqual(["E002 root/actions/help"]);
    expect(
      failures(
        loginTsx,
        mutate(
          loginCss,
          "@media (min-width: 600px)",
          "@media (min-width: 700px)",
        ),
      ),
    ).toStrictEqual(["E002 "]);
  });

  it("E003 : déclaration, attribut, balise ou règle hors des formes du compilateur", () => {
    expect(
      failures(
        loginTsx,
        mutate(
          loginCss,
          "  background: var(--color-bg-canvas);\n}",
          "  background: var(--color-bg-canvas);\n  float: left;\n}",
        ),
      ),
    ).toStrictEqual(["E003 root"]);
    expect(
      failures(
        loginTsx,
        mutate(
          loginCss,
          "  align-items: stretch;\n  background",
          "  align-items: stretch;\n  overflow-x: auto;\n  background",
        ),
      ),
    ).toStrictEqual(["E003 root"]);
    expect(
      failures(
        loginTsx,
        mutate(
          loginCss,
          ".help {\n  width: var(--size-icon-md);\n  flex-shrink: 0;\n  height: var(--size-icon-md);\n  color: var(--color-text-secondary);\n}\n",
          "",
        ),
      ),
    ).toStrictEqual(["E003 root/actions/help"]);
    expect(
      failures(
        mutate(
          mutate(loginTsx, "<p className", "<section className"),
          "</p>",
          "</section>",
        ),
        loginCss,
      ),
    ).toStrictEqual(["E003 root/subtitle"]);
    expect(
      failures(
        mutate(loginTsx, "className={s.title}", "className={s.nope}"),
        loginCss,
      ),
    ).toStrictEqual(["E003 root/title"]);
    expect(
      failures(
        mutate(
          loginTsx,
          'aria-label="Email"',
          'aria-label="Email" tabIndex="0"',
        ),
        loginCss,
      ),
    ).toStrictEqual(["E003 root/form/email"]);
    expect(
      failures(
        loginTsx,
        mutate(loginCss, ".password {", ".password {\n  min-width: 0;"),
      ),
    ).toStrictEqual(["E003 root/form/password"]);
    expect(
      failures(
        loginTsx,
        mutate(
          loginCss,
          "  flex-direction: column;\n  width: 100%;",
          "  width: 100%;",
        ),
      ),
    ).toStrictEqual(["E003 root"]);
  });

  it("E003 : sources qui ne sont pas du code généré", () => {
    expect(failures("export const x = 1;\n", loginCss)[0]).toBe("E003 ");
    expect(failures(loginTsx, ".root { display: flex }\n")[0]).toBe("E003 ");
    expect(
      failures(
        mutate(
          loginTsx,
          'import s from "./Login.gen.module.css";',
          'import styles from "./Login.css";',
        ),
        loginCss,
      )[0],
    ).toBe("E003 ");
  });

  it("E005 : data-ir dupliqué", () => {
    expect(
      failures(
        mutate(loginTsx, 'data-ir="subtitle"', 'data-ir="title"'),
        mutate(loginCss, ".subtitle {", ".subtitle-unused {"),
      ),
    ).toContain("E005 root/title");
  });
});
