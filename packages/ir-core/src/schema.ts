/**
 * Schémas zod de l'AST, pour valider un AST JSON (spec §3.3).
 *
 * Chaque schéma exporté est annoté avec le type de `ast.ts` qu'il valide :
 * le compilateur vérifie ainsi que la sortie du schéma est assignable au
 * type public. Les objets sont stricts : une clé inconnue est rejetée, ce
 * qui correspond à E004 (propriété invalide pour ce type de nœud).
 *
 * Ce que ces schémas ne vérifient pas, parce que ce n'est pas structurel :
 * l'unicité des `#id` (E005), l'existence des tokens et des breakpoints dans
 * le design system (E002), la dimension résolvable d'une `Image` (E006).
 */

import { z } from "zod";

import type {
  Border,
  BoxProps,
  Content,
  IconProps,
  ImageProps,
  Length,
  Node,
  Overridable,
  Override,
  Pad,
  Ratio,
  Role,
  Screen,
  Size,
  StackProps,
  TextProps,
  Token,
  TokenGroup,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------

/** IDENT de la grammaire. Le lexique n'est pas fixé par la spec : non vide. */
const ident = z.string().min(1);

function token<G extends TokenGroup>(group: G): z.ZodType<Token<G>> {
  return z.strictObject({
    group: z.literal(group),
    path: z.array(ident).min(1),
  });
}

export const SpaceTokenSchema = token("space");
export const SizeTokenSchema = token("size");
export const ColorTokenSchema = token("color");
export const TypographyTokenSchema = token("type");
export const RadiusTokenSchema = token("radius");
export const ShadowTokenSchema = token("shadow");
export const OpacityTokenSchema = token("opacity");
export const IconTokenSchema = token("icon");

export const SizeSchema: z.ZodType<Size> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fixed"), value: z.number() }),
  z.strictObject({ kind: z.literal("hug") }),
  z.strictObject({ kind: z.literal("fill") }),
]);

export const LengthSchema: z.ZodType<Length> = z.union([
  z.number(),
  SizeTokenSchema,
]);

export const RoleSchema: z.ZodType<Role> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.literal("heading"),
    level: z.number().int().min(1),
  }),
  z.strictObject({ kind: z.literal("button") }),
  z.strictObject({ kind: z.literal("textfield") }),
  z.strictObject({ kind: z.literal("list") }),
  z.strictObject({ kind: z.literal("listitem") }),
  z.strictObject({ kind: z.literal("image") }),
  z.strictObject({ kind: z.literal("decorative") }),
]);

export const ContentSchema: z.ZodType<Content> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("literal"), value: z.string() }),
  z.strictObject({ kind: z.literal("slot"), name: ident }),
]);

export const DirSchema = z.enum(["v", "h"]);
export const MainAlignSchema = z.enum(["start", "center", "end", "between"]);
export const CrossAlignSchema = z.enum(["start", "center", "end", "stretch"]);
export const OverflowSchema = z.enum(["visible", "clip", "scroll"]);
export const TextAlignSchema = z.enum(["start", "center", "end"]);
export const TruncateSchema = z.enum(["none", "end"]);
export const FitSchema = z.enum(["cover", "contain"]);

export const PadSchema: z.ZodType<Pad> = z.union([
  SpaceTokenSchema,
  z.tuple([SpaceTokenSchema, SpaceTokenSchema]),
  z.tuple([
    SpaceTokenSchema,
    SpaceTokenSchema,
    SpaceTokenSchema,
    SpaceTokenSchema,
  ]),
]);

export const BorderSchema: z.ZodType<Border> = z.tuple([
  SizeTokenSchema,
  ColorTokenSchema,
]);

export const RatioSchema: z.ZodType<Ratio> = z.tuple([
  z.number().int(),
  z.number().int(),
]);

// ---------------------------------------------------------------------------
// Propriétés. Chaque groupe est défini une fois puis composé par spread.
// ---------------------------------------------------------------------------

const dims = {
  w: SizeSchema.exactOptional(),
  h: SizeSchema.exactOptional(),
};

const constraints = {
  minW: LengthSchema.exactOptional(),
  maxW: LengthSchema.exactOptional(),
  minH: LengthSchema.exactOptional(),
  maxH: LengthSchema.exactOptional(),
};

/** Non surchargeables (spec §4.7). */
const semantics = {
  role: RoleSchema.exactOptional(),
  label: z.string().exactOptional(),
};

const style = {
  bg: ColorTokenSchema.exactOptional(),
  radius: RadiusTokenSchema.exactOptional(),
  border: BorderSchema.exactOptional(),
  shadow: ShadowTokenSchema.exactOptional(),
  opacity: OpacityTokenSchema.exactOptional(),
};

const stackLayout = {
  gap: SpaceTokenSchema.exactOptional(),
  pad: PadSchema.exactOptional(),
  mainAlign: MainAlignSchema.exactOptional(),
  crossAlign: CrossAlignSchema.exactOptional(),
  overflow: OverflowSchema.exactOptional(),
};

const textStyle = {
  align: TextAlignSchema.exactOptional(),
  maxLines: z.number().int().min(1).exactOptional(),
  truncate: TruncateSchema.exactOptional(),
};

const imageStyle = {
  fit: FitSchema.exactOptional(),
  ratio: RatioSchema.exactOptional(),
  radius: RadiusTokenSchema.exactOptional(),
};

export const StackPropsSchema: z.ZodType<StackProps> = z.strictObject({
  ...dims,
  ...constraints,
  ...semantics,
  dir: DirSchema,
  ...stackLayout,
  ...style,
});

const StackOverridableSchema: z.ZodType<Overridable<StackProps>> =
  z.strictObject({
    ...dims,
    ...constraints,
    dir: DirSchema.exactOptional(),
    ...stackLayout,
    ...style,
  });

export const BoxPropsSchema: z.ZodType<BoxProps> = z.strictObject({
  ...dims,
  ...constraints,
  ...semantics,
  ...style,
});

const BoxOverridableSchema: z.ZodType<Overridable<BoxProps>> = z.strictObject({
  ...dims,
  ...constraints,
  ...style,
});

export const TextPropsSchema: z.ZodType<TextProps> = z.strictObject({
  ...dims,
  ...constraints,
  ...semantics,
  style: TypographyTokenSchema,
  color: ColorTokenSchema,
  ...textStyle,
});

const TextOverridableSchema: z.ZodType<Overridable<TextProps>> = z.strictObject(
  {
    ...dims,
    ...constraints,
    style: TypographyTokenSchema.exactOptional(),
    color: ColorTokenSchema.exactOptional(),
    ...textStyle,
  },
);

export const ImagePropsSchema: z.ZodType<ImageProps> = z.strictObject({
  ...dims,
  ...constraints,
  ...semantics,
  ...imageStyle,
});

const ImageOverridableSchema: z.ZodType<Overridable<ImageProps>> =
  z.strictObject({
    ...dims,
    ...constraints,
    ...imageStyle,
  });

export const IconPropsSchema: z.ZodType<IconProps> = z.strictObject({
  ...constraints,
  ...semantics,
  name: IconTokenSchema,
  size: SizeTokenSchema,
  color: ColorTokenSchema,
});

const IconOverridableSchema: z.ZodType<Overridable<IconProps>> = z.strictObject(
  {
    ...constraints,
    name: IconTokenSchema.exactOptional(),
    size: SizeTokenSchema.exactOptional(),
    color: ColorTokenSchema.exactOptional(),
  },
);

// ---------------------------------------------------------------------------
// Nœuds et document
// ---------------------------------------------------------------------------

function overrides<P>(
  props: z.ZodType<Overridable<P>>,
): z.ZodType<readonly Override<P>[]> {
  return z.array(z.strictObject({ breakpoint: ident, props }));
}

/** Récursif : `Stack` contient des `Node`. */
export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.discriminatedUnion("type", [
    StackNodeSchema,
    BoxNodeSchema,
    TextNodeSchema,
    ImageNodeSchema,
    IconNodeSchema,
  ]),
);

const StackNodeSchema = z.strictObject({
  type: z.literal("Stack"),
  id: ident.exactOptional(),
  props: StackPropsSchema,
  overrides: overrides<StackProps>(StackOverridableSchema),
  children: z.array(NodeSchema),
});

const BoxNodeSchema = z.strictObject({
  type: z.literal("Box"),
  id: ident.exactOptional(),
  props: BoxPropsSchema,
  overrides: overrides<BoxProps>(BoxOverridableSchema),
});

const TextNodeSchema = z.strictObject({
  type: z.literal("Text"),
  id: ident.exactOptional(),
  props: TextPropsSchema,
  overrides: overrides<TextProps>(TextOverridableSchema),
  content: ContentSchema,
});

const ImageNodeSchema = z.strictObject({
  type: z.literal("Image"),
  id: ident.exactOptional(),
  props: ImagePropsSchema,
  overrides: overrides<ImageProps>(ImageOverridableSchema),
  content: ContentSchema,
});

const IconNodeSchema = z.strictObject({
  type: z.literal("Icon"),
  id: ident.exactOptional(),
  props: IconPropsSchema,
  overrides: overrides<IconProps>(IconOverridableSchema),
});

export const ScreenSchema: z.ZodType<Screen> = z.strictObject({
  name: ident,
  children: z.array(NodeSchema),
});
