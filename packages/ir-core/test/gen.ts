import * as fc from "fast-check";

import { normalize } from "../src/index.js";

import type {
  BoxNode,
  Content,
  IconNode,
  ImageNode,
  Length,
  Node,
  Role,
  Screen,
  Size,
  StackNode,
  TextNode,
  Token,
  TokenGroup,
} from "../src/index.js";

/**
 * Générateur `genIR` (spec §8.1) : arbres bien typés, profondeur ≤ 5,
 * largeur ≤ 4, tokens tirés du design system de fixture.
 *
 * `genRawIR` produit des arbres bien typés quelconques, dont les `#id`
 * présents sont rendus uniques ; `genIR` les passe par la forme normale
 * `N`, comme le §8.1 le demande. Les tests de `N` elle-même tirent de
 * `genRawIR`.
 */

/** Tokens référençables de `fixtures/design-system/tokens.json`. */
export const FIXTURE_TOKENS: {
  readonly [G in TokenGroup]: readonly (readonly string[])[];
} = {
  space: [["none"], ["xs"], ["sm"], ["md"], ["lg"], ["xl"]],
  size: [["hairline"], ["icon", "sm"], ["icon", "md"], ["icon", "lg"]],
  color: [
    ["bg", "canvas"],
    ["bg", "field"],
    ["text", "primary"],
    ["text", "secondary"],
    ["text", "onAccent"],
    ["accent"],
    ["border", "default"],
  ],
  type: [
    ["heading", "lg"],
    ["heading", "md"],
    ["body", "md"],
    ["body", "sm"],
    ["label", "md"],
  ],
  radius: [["sm"], ["md"], ["lg"], ["full"]],
  shadow: [["sm"], ["md"]],
  opacity: [["disabled"], ["muted"]],
  icon: [["help"], ["check"], ["close"], ["chevron-right"], ["search"]],
};

export function genToken<G extends TokenGroup>(
  group: G,
): fc.Arbitrary<Token<G>> {
  return fc
    .constantFrom(...FIXTURE_TOKENS[group])
    .map((path) => ({ group, path }));
}

/** IDENT de la spec §3.1, restreint pour rester lisible dans les contre-exemples. */
const genIdent = fc.stringMatching(/^[a-z][a-zA-Z0-9_-]{0,7}$/);

const genText = fc.string({ unit: "grapheme", maxLength: 40 });

const genLiteralLength = fc.oneof(
  fc.integer({ min: 0, max: 2000 }),
  fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }),
);

export const genSize: fc.Arbitrary<Size> = fc.oneof(
  fc.constant({ kind: "hug" } as const),
  fc.constant({ kind: "fill" } as const),
  genLiteralLength.map((value) => ({ kind: "fixed", value }) as const),
);

export const genLength: fc.Arbitrary<Length> = fc.oneof(
  genLiteralLength,
  genToken("size"),
);

export const genRole: fc.Arbitrary<Role> = fc.oneof(
  fc.constant({ kind: "none" } as const),
  fc.constant({ kind: "button" } as const),
  fc.constant({ kind: "textfield" } as const),
  fc.constant({ kind: "list" } as const),
  fc.constant({ kind: "listitem" } as const),
  fc.constant({ kind: "image" } as const),
  fc.constant({ kind: "decorative" } as const),
  fc
    .integer({ min: 1, max: 6 })
    .map((level) => ({ kind: "heading", level }) as const),
);

export const genContent: fc.Arbitrary<Content> = fc.oneof(
  genText.map((value) => ({ kind: "literal", value }) as const),
  genIdent.map((name) => ({ kind: "slot", name }) as const),
);

const genPad = fc.oneof(
  genToken("space"),
  fc.tuple(genToken("space"), genToken("space")),
  fc.tuple(
    genToken("space"),
    genToken("space"),
    genToken("space"),
    genToken("space"),
  ),
);

const genBorder = fc.tuple(genToken("size"), genToken("color"));
const genRatio = fc.tuple(
  fc.integer({ min: 1, max: 32 }),
  fc.integer({ min: 1, max: 32 }),
);

// Modèles de propriétés. `requiredKeys` fait que les clés optionnelles sont
// absentes, jamais `undefined`, comme l'exige l'AST. `noNullPrototype` :
// fast-check produirait sinon des objets à prototype null, qui ne sont pas
// du JSON ordinaire et que `toStrictEqual` distingue.

const REC = { noNullPrototype: true } as const;

const dims = { w: genSize, h: genSize };
const constraints = {
  minW: genLength,
  maxW: genLength,
  minH: genLength,
  maxH: genLength,
};
const semantics = {
  role: genRole,
  label: fc.string({ unit: "grapheme", minLength: 1, maxLength: 20 }),
};
const style = {
  bg: genToken("color"),
  radius: genToken("radius"),
  border: genBorder,
  shadow: genToken("shadow"),
  opacity: genToken("opacity"),
};
const stackLayout = {
  gap: genToken("space"),
  pad: genPad,
  mainAlign: fc.constantFrom("start", "center", "end", "between"),
  crossAlign: fc.constantFrom("start", "center", "end", "stretch"),
  overflow: fc.constantFrom("visible", "clip", "scroll"),
};
const textStyle = {
  align: fc.constantFrom("start", "center", "end"),
  maxLines: fc.integer({ min: 1, max: 10 }),
  truncate: fc.constantFrom("none", "end"),
};
const imageStyle = {
  fit: fc.constantFrom("cover", "contain"),
  ratio: genRatio,
  radius: genToken("radius"),
};
const iconStyle = {
  name: genToken("icon"),
  size: genToken("size"),
  color: genToken("color"),
};

const genDir = fc.constantFrom("v", "h");

const genStackProps = fc.record(
  {
    ...dims,
    ...constraints,
    ...semantics,
    dir: genDir,
    ...stackLayout,
    ...style,
  },
  { ...REC, requiredKeys: ["dir"] },
);
const genStackOverride = fc.record(
  { ...dims, ...constraints, dir: genDir, ...stackLayout, ...style },
  { ...REC, requiredKeys: [] },
);

const genBoxProps = fc.record(
  { ...dims, ...constraints, ...semantics, ...style },
  { ...REC, requiredKeys: [] },
);
const genBoxOverride = fc.record(
  { ...dims, ...constraints, ...style },
  { ...REC, requiredKeys: [] },
);

const genTextProps = fc.record(
  {
    ...dims,
    ...constraints,
    ...semantics,
    style: genToken("type"),
    color: genToken("color"),
    ...textStyle,
  },
  { ...REC, requiredKeys: ["style", "color"] },
);
const genTextOverride = fc.record(
  {
    ...dims,
    ...constraints,
    style: genToken("type"),
    color: genToken("color"),
    ...textStyle,
  },
  { ...REC, requiredKeys: [] },
);

const genImageProps = fc.record(
  { ...dims, ...constraints, ...semantics, ...imageStyle },
  { ...REC, requiredKeys: [] },
);
const genImageOverride = fc.record(
  { ...dims, ...constraints, ...imageStyle },
  { ...REC, requiredKeys: [] },
);

const genIconProps = fc.record(
  { ...semantics, ...iconStyle },
  { ...REC, requiredKeys: ["name", "size", "color"] },
);
const genIconOverride = fc.record(iconStyle, { ...REC, requiredKeys: [] });

/** Au plus une surcharge, sur le seul breakpoint non-base de la v0. */
function genOverrides<P>(
  props: fc.Arbitrary<P>,
): fc.Arbitrary<{ breakpoint: string; props: P }[]> {
  return fc.array(
    fc.record({ breakpoint: fc.constant("expanded"), props }, REC),
    {
      maxLength: 1,
    },
  );
}

const MAX_DEPTH = 5;
const MAX_WIDTH = 4;

const tree = fc.letrec<{
  node: Node;
  leaf: BoxNode | TextNode | ImageNode | IconNode;
  stack: StackNode;
}>((tie) => ({
  leaf: fc.oneof(
    fc.record(
      {
        type: fc.constant("Box" as const),
        id: genIdent,
        props: genBoxProps,
        overrides: genOverrides(genBoxOverride),
      },
      { ...REC, requiredKeys: ["type", "props", "overrides"] },
    ),
    fc.record(
      {
        type: fc.constant("Text" as const),
        id: genIdent,
        props: genTextProps,
        overrides: genOverrides(genTextOverride),
        content: genContent,
      },
      { ...REC, requiredKeys: ["type", "props", "overrides", "content"] },
    ),
    fc.record(
      {
        type: fc.constant("Image" as const),
        id: genIdent,
        props: genImageProps,
        overrides: genOverrides(genImageOverride),
        content: genContent,
      },
      { ...REC, requiredKeys: ["type", "props", "overrides", "content"] },
    ),
    fc.record(
      {
        type: fc.constant("Icon" as const),
        id: genIdent,
        props: genIconProps,
        overrides: genOverrides(genIconOverride),
      },
      { ...REC, requiredKeys: ["type", "props", "overrides"] },
    ),
  ),
  stack: fc.record(
    {
      type: fc.constant("Stack" as const),
      id: genIdent,
      props: genStackProps,
      overrides: genOverrides(genStackOverride),
      children: fc.array(tie("node"), { maxLength: MAX_WIDTH }),
    },
    { ...REC, requiredKeys: ["type", "props", "overrides", "children"] },
  ),
  // Au-delà de MAX_DEPTH seule la première alternative (feuille) est tirée.
  node: fc.oneof(
    { maxDepth: MAX_DEPTH, depthIdentifier: "ir-node", withCrossShrink: true },
    tie("leaf"),
    tie("stack"),
  ),
}));

/** Renomme les `#id` présents en `n1`, `n2`, … dans l'ordre de parcours. */
function withUniqueIds(screen: Screen): Screen {
  let next = 0;
  const visit = (node: Node): Node => {
    const { id, ...rest } = node;
    const renamed = id === undefined ? {} : { id: `n${String(++next)}` };
    if (rest.type === "Stack") {
      return { ...rest, ...renamed, children: rest.children.map(visit) };
    }
    return { ...rest, ...renamed };
  };
  return { ...screen, root: visit(screen.root) };
}

export const genNode: fc.Arbitrary<Node> = tree.node;

export const genRawIR: fc.Arbitrary<Screen> = fc
  .record({ name: genIdent, root: genNode }, REC)
  .map(withUniqueIds);

export const genIR: fc.Arbitrary<Screen> = genRawIR.map(
  (screen) => normalize(screen).screen,
);
