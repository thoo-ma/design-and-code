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
} from "../ast.js";
import { BASE_BREAKPOINT, EXPECTED_TYPE } from "../design-system.js";
import type { DesignSystem } from "../design-system.js";
import { normalize } from "../normalize.js";

import { fixtureDesignSystem } from "./fixture.js";

/**
 * Générateurs `genIR(designSystem, profondeur ≤ 5, largeur ≤ 4)` (spec §8.1).
 *
 * `generatorsFor(ds)` construit les générateurs pour un design system donné :
 * les tokens sont tirés de sa table des référençables, les icônes de son jeu,
 * les breakpoints de son groupe `bp`. `genRawIR` produit des arbres bien
 * typés quelconques, dont les `#id` présents sont rendus uniques et dont les
 * `Image` ont leurs axes résolvables (E006) ; `genIR` les passe par la forme
 * normale `N`. Les exports sans suffixe sont ceux du design system de fixture.
 */

const MAX_DEPTH = 5;
const MAX_WIDTH = 4;

/** `requiredKeys` rend les clés optionnelles absentes, jamais `undefined` ;
 * `noNullPrototype` évite les objets à prototype null de fast-check. */
const REC = { noNullPrototype: true } as const;

export interface Generators {
  readonly genToken: <G extends TokenGroup>(group: G) => fc.Arbitrary<Token<G>>;
  readonly genNode: fc.Arbitrary<Node>;
  readonly genRawIR: fc.Arbitrary<Screen>;
  readonly genIR: fc.Arbitrary<Screen>;
}

export function generatorsFor(ds: DesignSystem): Generators {
  const paths = (group: TokenGroup): readonly (readonly string[])[] => {
    if (group === "icon") return [...ds.icons.keys()].map((name) => [name]);
    return [...ds.tokens.values()]
      .filter(
        (e) =>
          e.referenceable &&
          e.path[0] === group &&
          e.type === EXPECTED_TYPE[group],
      )
      .map((e) => e.path.slice(1));
  };
  for (const group of [
    "space",
    "size",
    "color",
    "type",
    "radius",
    "shadow",
    "opacity",
    "icon",
  ] as const) {
    if (paths(group).length === 0) {
      throw new Error(
        `generatorsFor : le design system n'a aucun token référençable dans le groupe ${group}.`,
      );
    }
  }
  const genToken = <G extends TokenGroup>(group: G): fc.Arbitrary<Token<G>> =>
    fc.constantFrom(...paths(group)).map((path) => ({ group, path }));

  const breakpoints = [...ds.breakpoints.keys()].filter(
    (b) => b !== BASE_BREAKPOINT,
  );

  /** IDENT de la spec §3.1, restreint pour rester lisible dans les contre-exemples. */
  const genIdent = fc.stringMatching(/^[a-z][a-zA-Z0-9_-]{0,7}$/);
  const genText = fc.string({ unit: "grapheme", maxLength: 40 });

  const genLiteralLength = fc.oneof(
    fc.integer({ min: 0, max: 2000 }),
    fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }),
  );
  const genLength: fc.Arbitrary<Length> = fc.oneof(
    genLiteralLength,
    genToken("size"),
  );
  const genFixedOrFill: fc.Arbitrary<Size> = fc.oneof(
    fc.constant({ kind: "fill" } as const),
    genLength.map((value) => ({ kind: "fixed", value }) as const),
  );
  const genSize: fc.Arbitrary<Size> = fc.oneof(
    fc.constant({ kind: "hug" } as const),
    genFixedOrFill,
  );

  const genRole: fc.Arbitrary<Role> = fc.oneof(
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

  const genContent: fc.Arbitrary<Content> = fc.oneof(
    genText.map((value) => ({ kind: "literal", value }) as const),
    genIdent.map((name) => ({ kind: "slot", name }) as const),
  );
  /** Slots d'Image en majuscule initiale : jamais le nom d'un slot de Text (§9.3). */
  const genImageContent: fc.Arbitrary<Content> = fc.oneof(
    genText.map((value) => ({ kind: "literal", value }) as const),
    genIdent.map((name) => ({ kind: "slot", name: `I${name}` }) as const),
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

  // Image : chaque axe résolvable (spec §4.5, E006). Les surcharges ne touchent
  // ni w, ni h, ni ratio, pour que cela reste vrai à chaque breakpoint.
  const genImageDims = fc.oneof(
    fc.record({ w: genFixedOrFill, h: genFixedOrFill }, REC),
    fc.record(
      {
        w: genFixedOrFill,
        h: fc.constant({ kind: "hug" } as const),
        ratio: genRatio,
      },
      { ...REC, requiredKeys: ["w", "ratio"] },
    ),
    fc.record(
      {
        h: genFixedOrFill,
        w: fc.constant({ kind: "hug" } as const),
        ratio: genRatio,
      },
      { ...REC, requiredKeys: ["h", "ratio"] },
    ),
  );
  const genImageProps = fc
    .tuple(
      genImageDims,
      fc.record(
        { ...constraints, ...semantics, ...imageStyle },
        { ...REC, requiredKeys: [] },
      ),
    )
    .map(([d, rest]) => ({ ...rest, ...d }));
  const genImageOverride = fc.record(
    { ...constraints, ...imageStyle },
    { ...REC, requiredKeys: [] },
  );

  const genIconProps = fc.record(
    { ...semantics, ...iconStyle },
    { ...REC, requiredKeys: ["name", "size", "color"] },
  );
  const genIconOverride = fc.record(iconStyle, { ...REC, requiredKeys: [] });

  /** Au plus une surcharge par breakpoint non-base du design system. */
  const genOverrides = <P>(
    props: fc.Arbitrary<P>,
  ): fc.Arbitrary<{ breakpoint: string; props: P }[]> =>
    breakpoints.length === 0
      ? fc.constant([])
      : fc.uniqueArray(
          fc.record(
            { breakpoint: fc.constantFrom(...breakpoints), props },
            REC,
          ),
          { maxLength: breakpoints.length, selector: (o) => o.breakpoint },
        );

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
          content: genImageContent,
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
      {
        maxDepth: MAX_DEPTH,
        depthIdentifier: "ir-node",
        withCrossShrink: true,
      },
      tie("leaf"),
      tie("stack"),
    ),
  }));

  const genNode: fc.Arbitrary<Node> = tree.node;
  const genRawIR: fc.Arbitrary<Screen> = fc
    .record({ name: genIdent, root: genNode }, REC)
    .map(withUniqueIds)
    .map(repairScroll)
    .map(repairImages);
  // N, puis scroll (peut passer un parent en hug), puis N (la règle 1 propage),
  // puis images, puis N : plus aucun fill ne change après la dernière réparation.
  const genIR: fc.Arbitrary<Screen> = genRawIR.map(
    (screen) =>
      normalize(
        repairImages(normalize(repairScroll(normalize(screen).screen)).screen),
      ).screen,
  );

  return { genToken, genNode, genRawIR, genIR };
}

/**
 * La règle 1 de N peut changer le `fill` d'une `Image` en `hug` et rendre un
 * axe non résolvable (E006 sur la forme normale, spec §4.5). Le générateur
 * répare en passant l'axe en `fixed`, pour que `genIR` reste typecheck-propre.
 */
function repairImages(screen: Screen): Screen {
  const resolvable = (s: Size | undefined): boolean =>
    s?.kind === "fixed" || s?.kind === "fill";
  const FIXED: Size = { kind: "fixed", value: 100 };
  type Dims = {
    readonly w?: Size;
    readonly h?: Size;
    readonly ratio?: readonly [number, number];
  };
  /** Rend résolvables les axes de `eff` ; ne rend que les axes à changer. */
  const missing = (eff: Dims): { w?: Size; h?: Size } => {
    const ratio = eff.ratio !== undefined;
    const out: { w?: Size; h?: Size } = {};
    let w = eff.w;
    const h = eff.h;
    if (!(resolvable(w) || (ratio && resolvable(h)))) {
      w = FIXED;
      out.w = FIXED;
    }
    if (!(resolvable(h) || (ratio && resolvable(w)))) {
      out.h = FIXED;
    }
    return out;
  };
  const visit = (node: Node): Node => {
    if (node.type === "Stack")
      return { ...node, children: node.children.map(visit) };
    if (node.type !== "Image") return node;
    const props = { ...node.props, ...missing(node.props) };
    const overrides = node.overrides.map((o) => ({
      breakpoint: o.breakpoint,
      props: { ...o.props, ...missing({ ...props, ...o.props }) },
    }));
    return { ...node, props, overrides };
  };
  return { ...screen, root: visit(screen.root) };
}

/**
 * Un enfant `fill` sur l'axe de défilement d'un Stack `scroll` est E007
 * (ADR-008). Le générateur le passe en `hug` à ce breakpoint.
 */
function repairScroll(screen: Screen): Screen {
  const breakpoints = new Set<string>([""]);
  const collect = (node: Node): void => {
    for (const o of node.overrides) breakpoints.add(o.breakpoint);
    if (node.type === "Stack") node.children.forEach(collect);
  };
  collect(screen.root);

  const effective = <P extends object>(
    base: P,
    overrides: readonly { breakpoint: string; props: Partial<P> }[],
    bp: string,
  ): P => {
    const o = overrides.find((x) => x.breakpoint === bp);
    return o === undefined ? base : { ...base, ...o.props };
  };

  const visit = (node: Node): Node => {
    if (node.type !== "Stack") return node;
    let children = node.children.map(visit);
    for (const bp of breakpoints) {
      const eff = effective(node.props, node.overrides, bp);
      if (eff.overflow !== "scroll") continue;
      const main = eff.dir === "h" ? "w" : "h";
      children = children.map((child) => {
        if (child.type === "Icon") return child;
        const childEff = effective(child.props, child.overrides, bp);
        if (childEff[main]?.kind !== "fill") return child;
        const hug = { kind: "hug" } as const;
        if (bp === "") {
          return { ...child, props: { ...child.props, [main]: hug } } as Node;
        }
        const others = child.overrides.filter((o) => o.breakpoint !== bp);
        const own = child.overrides.find((o) => o.breakpoint === bp);
        const overrides = [
          ...others,
          { breakpoint: bp, props: { ...(own?.props ?? {}), [main]: hug } },
        ];
        return { ...child, overrides } as Node;
      });
    }
    return { ...node, children };
  };
  return { ...screen, root: visit(screen.root) };
}

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

const fixture = generatorsFor(fixtureDesignSystem);

/** Générateurs sur le design system de fixture. */
export const genToken = fixture.genToken;
export const genNode = fixture.genNode;
export const genRawIR = fixture.genRawIR;
export const genIR = fixture.genIR;
