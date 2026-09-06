import { describe, expect, it } from "vitest";

import { parse } from "../src/index.js";
import type { IRError } from "../src/index.js";

/** Enveloppe un nœud dans un écran ; le nœud commence ligne 2, colonne 3. */
const wrap = (node: string): string => `screen S {\n  ${node}\n}\n`;

const errorsOf = (source: string): readonly IRError[] => {
  const result = parse(source);
  expect(result.ok, `attendu un échec pour :\n${source}`).toBe(false);
  return result.ok ? [] : result.errors;
};

const only = (source: string): IRError => {
  const errors = errorsOf(source);
  expect(errors).toHaveLength(1);
  return errors[0] ?? { code: "E009", path: "", message: "" };
};

const TEXT_PROPS = "style: $type.body.md, color: $color.text.primary";

describe("E009 — erreurs de syntaxe", () => {
  it.each<[string, string, { line: number; column: number } | undefined]>([
    ["fichier vide", "", { line: 1, column: 1 }],
    ["mot-clé screen manquant", "page S { Box () }", { line: 1, column: 1 }],
    ["nom d'écran manquant", "screen { Box () }", { line: 1, column: 8 }],
    ["écran sans racine", "screen S { }", { line: 1, column: 12 }],
    ["deux racines", "screen S { Box () Box () }", { line: 1, column: 19 }],
    ["type de nœud inconnu", "screen S { Grid () }", { line: 1, column: 12 }],
    ["parenthèse fermante manquante", "screen S { Box ( }", undefined],
    [
      "chaîne non terminée",
      wrap(`Text (${TEXT_PROPS}) "oops }`),
      { line: 2, column: 59 },
    ],
    [
      "texte après la fermeture",
      "screen S { Box () } extra",
      { line: 1, column: 21 },
    ],
    ["valeur manquante", wrap("Box (w: fixed())"), undefined],
    [
      "token à un seul segment",
      wrap("Box (bg: $color)"),
      { line: 2, column: 12 },
    ],
    ["bloc non fermé", "screen S { Stack (dir: v) { Box () }", undefined],
    ["caractère inattendu", wrap("Box () ;"), { line: 2, column: 10 }],
    [
      "nombre négatif (l'IR n'en a pas)",
      wrap("Box (w: fixed(-1))"),
      { line: 2, column: 17 },
    ],
    ["surcharge sans parenthèses", wrap("Box () @expanded"), undefined],
    [
      "bloc sur une feuille avant les propriétés",
      wrap("Box { }"),
      { line: 2, column: 7 },
    ],
  ])("%s", (_label, source, position) => {
    const e = only(source);
    expect(e.code).toBe("E009");
    if (position !== undefined) expect(e.position).toStrictEqual(position);
    expect(e.message.length).toBeGreaterThan(0);
  });

  it("une erreur de syntaxe arrête l'analyse : une seule erreur rapportée", () => {
    const errors = errorsOf(wrap("Stack (dir: v, gap: 8) { Grid () }"));
    expect(errors.map((e) => e.code)).toStrictEqual(["E001", "E009"]);
  });
});

describe("E001 — littéral là où un token est requis", () => {
  it.each<[string, string, number]>([
    ["gap littéral", "Stack (dir: v, gap: 8)", 23],
    ["couleur littérale", 'Box (bg: "red")', 12],
    ["style littéral", `Text (style: 16, color: $color.text.primary) "x"`, 16],
    ["pad littéral dans un tuple", "Stack (dir: v, pad: (8, 8))", 24],
    ["bordure littérale", "Box (border: (1, $color.border.default))", 17],
    [
      "taille d'icône littérale",
      "Icon (name: $icon.help, size: 24, color: $color.text.primary)",
      33,
    ],
  ])("%s", (_label, node, column) => {
    const e = only(wrap(node));
    expect(e.code).toBe("E001");
    expect(e.position).toStrictEqual({ line: 2, column });
    expect(e.message).toContain("token");
  });
});

describe("E004 — propriété invalide pour ce type de nœud", () => {
  it.each<[string, string]>([
    ["propriété inconnue", "Box (gap: $space.sm)"],
    ["propriété dupliquée", "Box (w: fill, w: hug)"],
    ["mauvais type de valeur", "Box (w: 48)"],
    ["fixed sans argument valide", "Box (w: fixed(hug))"],
    ["dir requis sur Stack", "Stack ()"],
    ["style requis sur Text", `Text (color: $color.text.primary) "x"`],
    [
      "size requis sur Icon",
      "Icon (name: $icon.help, color: $color.text.primary)",
    ],
    ["contenu sur Box", 'Box () "x"'],
    [
      "contenu sur Icon",
      "Icon (name: $icon.help, size: $size.icon.md, color: $color.text.primary) slot(x)",
    ],
    ["contenu manquant sur Text", `Text (${TEXT_PROPS})`],
    ["contenu manquant sur Image", "Image (fit: cover)"],
    ["bloc sur Text", `Text (${TEXT_PROPS}) "x" { }`],
    ["surcharge de role", "Box () @expanded(role: button)"],
    ["surcharge de label", 'Box () @expanded(label: "x")'],
    ["surcharge dupliquée", "Box () @expanded(w: fill) @expanded(h: fill)"],
    ["maxLines: 0", `Text (${TEXT_PROPS}, maxLines: 0) "x"`],
    ["token du mauvais groupe", "Stack (dir: v, gap: $color.accent)"],
    [
      "pad de trois valeurs",
      "Stack (dir: v, pad: ($space.sm, $space.sm, $space.sm))",
    ],
    [
      "w sur Icon",
      "Icon (name: $icon.help, size: $size.icon.md, color: $color.text.primary, w: fill)",
    ],
    [
      "minW sur Icon",
      "Icon (name: $icon.help, size: $size.icon.md, color: $color.text.primary, minW: 8)",
    ],
    ["heading(7)", `Text (${TEXT_PROPS}, role: heading(7)) "x"`],
    ["ratio nul", 'Image (ratio: (0, 1)) "a.png"'],
    ["énumération inconnue", "Stack (dir: diagonal)"],
    ["label sans guillemets", "Box (label: Email)"],
  ])("%s", (_label, node) => {
    const errors = errorsOf(wrap(node));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.code === "E004")).toBe(true);
    expect(errors[0]?.position?.line).toBe(2);
  });

  it("plusieurs erreurs sont rapportées ensemble, avec le chemin du nœud", () => {
    const errors = errorsOf(
      "screen S {\n  Stack #root (dir: v) {\n    Stack #form (dir: v) {\n      Box #email (gap: $space.sm, w: 48)\n    }\n  }\n}\n",
    );
    expect(
      errors.map((e) => [e.code, e.path, e.position?.line, e.position?.column]),
    ).toStrictEqual([
      ["E004", "root/form/email", 4, 19],
      ["E004", "root/form/email", 4, 38],
    ]);
  });

  it("un nœud sans #id est désigné par son type et son index", () => {
    const [e] = errorsOf(
      "screen S {\n  Stack (dir: v) {\n    Box ()\n    Box (gap: $space.sm)\n  }\n}\n",
    );
    expect(e?.path).toBe("Stack[0]/Box[1]");
  });
});

describe("E005 — identifiant dupliqué", () => {
  it("désigne la seconde occurrence et nomme la première", () => {
    const e = only(
      "screen S {\n  Stack #a (dir: v) {\n    Box #b ()\n    Box #a ()\n  }\n}\n",
    );
    expect(e.code).toBe("E005");
    expect(e.path).toBe("a/a");
    expect(e.position).toStrictEqual({ line: 4, column: 5 });
    expect(e.message).toContain("#a");
  });
});

describe("ce qui passe", () => {
  it.each<string>([
    "screen S { Box () }",
    "screen S{Box()}",
    "screen S {\n\n\n  Box   (  w :  fill ,h:hug )\n\n}",
    "screen S { Stack (dir: v) }",
    "screen S { Stack (dir: v) {} }",
    "screen S { Box () @expanded() }",
    `screen S { Text (${TEXT_PROPS}) "a\\"b\\\\c\\n" }`,
    "screen S { Box (maxW: 1e3, minW: 0.5) }",
    "screen S { Icon (name: $icon.chevron-right, size: $size.icon.sm, color: $color.accent) }",
    `screen S { Text (${TEXT_PROPS}) "x" @expanded(${TEXT_PROPS}) }`,
  ])("%s", (source) => {
    const result = parse(source);
    expect(result.ok, result.ok ? "" : JSON.stringify(result.errors)).toBe(
      true,
    );
  });

  it("un Stack sans bloc n'a pas d'enfant", () => {
    const result = parse("screen S { Stack (dir: v) }");
    expect(result.ok).toBe(true);
    if (result.ok && result.value.screen.root.type === "Stack") {
      expect(result.value.screen.root.children).toStrictEqual([]);
    }
  });
});
