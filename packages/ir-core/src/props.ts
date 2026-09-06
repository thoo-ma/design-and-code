/**
 * Table des propriétés par type de nœud (spec §4), dans l'ordre canonique de
 * §6 règle 5 : `w`/`h`, contraintes, propriétés du type, style, `role`/`label`.
 *
 * Le parseur s'en sert pour convertir, vérifier les propriétés requises et
 * refuser les surcharges de `role`/`label` (§4.7). Le printer suit le même
 * ordre, écrit en clair dans `printer.ts` ; la loi 0 vérifie leur accord.
 */

import type { NodeType } from "./ast.js";
import {
  convBorder,
  convEnum,
  convInt,
  convLength,
  convPad,
  convRatio,
  convRole,
  convSize,
  convString,
  convToken,
} from "./values.js";
import type { Converter } from "./values.js";

export interface PropSpec {
  readonly key: string;
  readonly conv: Converter<unknown>;
  readonly required: boolean;
  /** Layout et style sont surchargeables ; `role` et `label` ne le sont pas. */
  readonly overridable: boolean;
}

const prop = (
  key: string,
  conv: Converter<unknown>,
  flags: { required?: true; overridable?: false } = {},
): PropSpec => ({
  key,
  conv,
  required: flags.required ?? false,
  overridable: flags.overridable ?? true,
});

const dims: readonly PropSpec[] = [prop("w", convSize), prop("h", convSize)];

const constraints: readonly PropSpec[] = [
  prop("minW", convLength),
  prop("maxW", convLength),
  prop("minH", convLength),
  prop("maxH", convLength),
];

const semantics: readonly PropSpec[] = [
  prop("role", convRole, { overridable: false }),
  prop("label", convString, { overridable: false }),
];

const style: readonly PropSpec[] = [
  prop("bg", convToken("color")),
  prop("radius", convToken("radius")),
  prop("border", convBorder),
  prop("shadow", convToken("shadow")),
  prop("opacity", convToken("opacity")),
];

export const PROP_SPECS: Readonly<Record<NodeType, readonly PropSpec[]>> = {
  Stack: [
    ...dims,
    ...constraints,
    prop("dir", convEnum(["v", "h"]), { required: true }),
    prop("gap", convToken("space")),
    prop("pad", convPad),
    prop("mainAlign", convEnum(["start", "center", "end", "between"])),
    prop("crossAlign", convEnum(["start", "center", "end", "stretch"])),
    prop("overflow", convEnum(["visible", "clip", "scroll"])),
    ...style,
    ...semantics,
  ],
  Box: [...dims, ...constraints, ...style, ...semantics],
  Text: [
    ...dims,
    ...constraints,
    prop("style", convToken("type"), { required: true }),
    prop("color", convToken("color"), { required: true }),
    prop("align", convEnum(["start", "center", "end"])),
    prop("maxLines", convInt(1)),
    prop("truncate", convEnum(["none", "end"])),
    ...semantics,
  ],
  Image: [
    ...dims,
    ...constraints,
    prop("fit", convEnum(["cover", "contain"])),
    prop("ratio", convRatio),
    prop("radius", convToken("radius")),
    ...semantics,
  ],
  Icon: [
    // Le contenu de l'Icon : requis, jamais surchargé (§4.6, §4.7).
    prop("name", convToken("icon"), { required: true, overridable: false }),
    prop("size", convToken("size"), { required: true }),
    prop("color", convToken("color"), { required: true }),
    ...semantics,
  ],
};
