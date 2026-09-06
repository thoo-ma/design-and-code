import * as fc from "fast-check";

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
 * En T1 il produit des arbres *bien typés*, pas encore en forme normale :
 * la forme normale `N` arrive en T3 et s'appliquera par composition.
 * Les `#id` présents sont rendus uniques après génération.
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

const genIdent = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,7}$/);

const genLiteralLength = fc.integer({ min: 0, max: 2000 });

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
  fc
    .string({ maxLength: 40 })
    .map((value) => ({ kind: "literal", value }) as const),
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

const dims = { w: genSize, h: genSize };
const constraints = {
  minW: genLength,
  maxW: genLength,
  minH: genLength,
  maxH: genLength,
};
const semantics = {
  role: genRole,
  label: fc.string({ minLength: 1, maxLength: 20 }),
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
  { noNullPrototype: true, requiredKeys: ["dir"] },
);
const genStackOverride = fc.record(
  { ...dims, ...constraints, dir: genDir, ...stackLayout, ...style },
  { noNullPrototype: true, requiredKeys: [] },
);

const genBoxProps = fc.record(
  { ...dims, ...constraints, ...semantics, ...style },
  { noNullPrototype: true, requiredKeys: [] },
);
const genBoxOverride = fc.record(
  { ...dims, ...constraints, ...style },
  { noNullPrototype: true, requiredKeys: [] },
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
  { noNullPrototype: true, requiredKeys: ["style", "color"] },
);
const genTextOverride = fc.record(
  {
    ...dims,
    ...constraints,
    style: genToken("type"),
    color: genToken("color"),
    ...textStyle,
  },
  { noNullPrototype: true, requiredKeys: [] },
);

const genImageProps = fc.record(
  { ...dims, ...constraints, ...semantics, ...imageStyle },
  { noNullPrototype: true, requiredKeys: [] },
);
const genImageOverride = fc.record(
  { ...dims, ...constraints, ...imageStyle },
  { noNullPrototype: true, requiredKeys: [] },
);

const genIconProps = fc.record(
  {
    ...constraints,
    ...semantics,
    name: genToken("icon"),
    size: genToken("size"),
    color: genToken("color"),
  },
  { noNullPrototype: true, requiredKeys: ["name", "size", "color"] },
);
const genIconOverride = fc.record(
  {
    ...constraints,
    name: genToken("icon"),
    size: genToken("size"),
    color: genToken("color"),
  },
  { noNullPrototype: true, requiredKeys: [] },
);

/** Au plus une surcharge, sur le seul breakpoint non-base de la v0. */
function genOverrides<P>(
  props: fc.Arbitrary<P>,
): fc.Arbitrary<{ breakpoint: string; props: P }[]> {
  return fc.array(
    fc.record(
      { breakpoint: fc.constant("expanded"), props },
      { noNullPrototype: true },
    ),
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
      { noNullPrototype: true, requiredKeys: ["type", "props", "overrides"] },
    ),
    fc.record(
      {
        type: fc.constant("Text" as const),
        id: genIdent,
        props: genTextProps,
        overrides: genOverrides(genTextOverride),
        content: genContent,
      },
      {
        noNullPrototype: true,
        requiredKeys: ["type", "props", "overrides", "content"],
      },
    ),
    fc.record(
      {
        type: fc.constant("Image" as const),
        id: genIdent,
        props: genImageProps,
        overrides: genOverrides(genImageOverride),
        content: genContent,
      },
      {
        noNullPrototype: true,
        requiredKeys: ["type", "props", "overrides", "content"],
      },
    ),
    fc.record(
      {
        type: fc.constant("Icon" as const),
        id: genIdent,
        props: genIconProps,
        overrides: genOverrides(genIconOverride),
      },
      { noNullPrototype: true, requiredKeys: ["type", "props", "overrides"] },
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
    {
      noNullPrototype: true,
      requiredKeys: ["type", "props", "overrides", "children"],
    },
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
    const renamed = node.id === undefined ? {} : { id: `n${++next}` };
    switch (node.type) {
      case "Stack": {
        const { id: _dropped, ...rest } = node;
        void _dropped;
        return { ...rest, ...renamed, children: node.children.map(visit) };
      }
      case "Box":
      case "Text":
      case "Image":
      case "Icon": {
        const { id: _dropped, ...rest } = node;
        void _dropped;
        return { ...rest, ...renamed };
      }
    }
  };
  return { ...screen, children: screen.children.map(visit) };
}

export const genNode: fc.Arbitrary<Node> = tree.node;

export const genIR: fc.Arbitrary<Screen> = fc
  .record(
    {
      name: genIdent,
      children: fc.array(genNode, { maxLength: MAX_WIDTH }),
    },
    { noNullPrototype: true },
  )
  .map(withUniqueIds);
