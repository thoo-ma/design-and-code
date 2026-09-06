/**
 * Valeurs brutes de la grammaire (`value := token | number | string | enum |
 * tuple | call`) et leur conversion vers les valeurs typées de l'AST.
 *
 * Un convertisseur rend E001 quand un littéral remplace un token requis, et
 * E004 pour toute autre valeur qui ne correspond pas au type de la propriété.
 */

import type {
  Border,
  Length,
  Pad,
  Ratio,
  Role,
  Size,
  SpaceToken,
  Token,
  TokenGroup,
} from "./ast.js";
import type { Position } from "./errors.js";

export type RawValue =
  | {
      readonly kind: "token";
      readonly segments: readonly string[];
      readonly pos: Position;
    }
  | { readonly kind: "number"; readonly value: number; readonly pos: Position }
  | { readonly kind: "string"; readonly value: string; readonly pos: Position }
  | { readonly kind: "enum"; readonly name: string; readonly pos: Position }
  | {
      readonly kind: "tuple";
      readonly items: readonly RawValue[];
      readonly pos: Position;
    }
  | {
      readonly kind: "call";
      readonly name: string;
      readonly args: readonly RawValue[];
      readonly pos: Position;
    };

export type ConvResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: "E001" | "E004";
      readonly message: string;
      /** Position plus précise que celle de la valeur entière (élément de tuple). */
      readonly pos?: Position;
    };

export type Converter<T> = (value: RawValue) => ConvResult<T>;

const good = <T>(value: T): ConvResult<T> => ({ ok: true, value });
const bad = <T>(code: "E001" | "E004", message: string): ConvResult<T> => ({
  ok: false,
  code,
  message,
});

/** Rend une valeur brute telle qu'elle s'écrit, pour les messages. */
export function showRaw(v: RawValue): string {
  switch (v.kind) {
    case "token":
      return `$${v.segments.join(".")}`;
    case "number":
      return String(v.value);
    case "string":
      return JSON.stringify(v.value);
    case "enum":
      return v.name;
    case "tuple":
      return `(${v.items.map(showRaw).join(", ")})`;
    case "call":
      return `${v.name}(${v.args.map(showRaw).join(", ")})`;
  }
}

export function convToken<G extends TokenGroup>(group: G): Converter<Token<G>> {
  return (v) => {
    if (v.kind === "token") {
      if (v.segments[0] === group) {
        return good({ group, path: v.segments.slice(1) });
      }
      return bad(
        "E004",
        `un token $${group}.* est attendu, trouvé ${showRaw(v)}.`,
      );
    }
    if (v.kind === "number" || v.kind === "string") {
      return bad(
        "E001",
        `un token $${group}.* est requis ; ${showRaw(v)} est un littéral. Le remplacer par un token du design system.`,
      );
    }
    return bad(
      "E004",
      `un token $${group}.* est attendu, trouvé ${showRaw(v)}.`,
    );
  };
}

export const convLength: Converter<Length> = (v) => {
  if (v.kind === "number") return good(v.value);
  if (v.kind === "token") {
    const t = convToken("size")(v);
    return t.ok
      ? good(t.value)
      : bad(
          "E004",
          `un nombre ou un token $size.* est attendu, trouvé ${showRaw(v)}.`,
        );
  }
  return bad(
    "E004",
    `un nombre ou un token $size.* est attendu, trouvé ${showRaw(v)}.`,
  );
};

export const convSize: Converter<Size> = (v) => {
  if (v.kind === "enum" && (v.name === "hug" || v.name === "fill")) {
    return good({ kind: v.name });
  }
  if (v.kind === "call" && v.name === "fixed") {
    const [n, ...rest] = v.args;
    if (n === undefined || rest.length > 0) {
      return bad(
        "E004",
        "fixed attend exactement une longueur, comme fixed(48) ou fixed($size.control).",
      );
    }
    const length = convLength(n);
    return length.ok ? good({ kind: "fixed", value: length.value }) : length;
  }
  return bad("E004", `fixed(n), hug ou fill attendu, trouvé ${showRaw(v)}.`);
};

export function convEnum<T extends string>(values: readonly T[]): Converter<T> {
  return (v) => {
    if (v.kind === "enum") {
      const found = values.find((x) => x === v.name);
      if (found !== undefined) return good(found);
    }
    return bad("E004", `${values.join(", ")} attendu, trouvé ${showRaw(v)}.`);
  };
}

const SIMPLE_ROLES = [
  "none",
  "button",
  "textfield",
  "list",
  "listitem",
  "image",
  "decorative",
] as const;

export const convRole: Converter<Role> = (v) => {
  if (v.kind === "enum") {
    const found = SIMPLE_ROLES.find((x) => x === v.name);
    if (found !== undefined) return good({ kind: found });
  }
  if (v.kind === "call" && v.name === "heading") {
    const [n, ...rest] = v.args;
    if (
      n === undefined ||
      rest.length > 0 ||
      n.kind !== "number" ||
      !Number.isInteger(n.value) ||
      n.value < 1 ||
      n.value > 6
    ) {
      return bad(
        "E004",
        "heading attend un entier entre 1 et 6, comme heading(1).",
      );
    }
    return good({ kind: "heading", level: n.value });
  }
  return bad(
    "E004",
    `none, heading(n), button, textfield, list, listitem, image ou decorative attendu, trouvé ${showRaw(v)}.`,
  );
};

export function convInt(min: number, max?: number): Converter<number> {
  const range = max === undefined ? `≥ ${min}` : `entre ${min} et ${max}`;
  return (v) => {
    if (
      v.kind !== "number" ||
      !Number.isInteger(v.value) ||
      v.value < min ||
      (max !== undefined && v.value > max)
    ) {
      return bad(
        "E004",
        `un entier ${range} est attendu, trouvé ${showRaw(v)}.`,
      );
    }
    return good(v.value);
  };
}

export const convString: Converter<string> = (v) =>
  v.kind === "string"
    ? good(v.value)
    : bad(
        "E004",
        `une chaîne entre guillemets est attendue, trouvé ${showRaw(v)}.`,
      );

const convSpace = convToken("space");

export const convPad: Converter<Pad> = (v) => {
  if (v.kind !== "tuple") {
    const t = convSpace(v);
    return t.ok ? good(t.value) : t;
  }
  const items: SpaceToken[] = [];
  for (const item of v.items) {
    const t = convSpace(item);
    if (!t.ok) return { ...t, pos: item.pos };
    items.push(t.value);
  }
  const [a, b, c, d] = items;
  if (items.length === 2 && a !== undefined && b !== undefined) {
    return good([a, b] as const);
  }
  if (
    items.length === 4 &&
    a !== undefined &&
    b !== undefined &&
    c !== undefined &&
    d !== undefined
  ) {
    return good([a, b, c, d] as const);
  }
  return bad(
    "E004",
    "pad accepte un token $space.*, ($v, $h) ou ($t, $r, $b, $l).",
  );
};

export const convBorder: Converter<Border> = (v) => {
  if (v.kind !== "tuple" || v.items.length !== 2) {
    return bad(
      "E004",
      `border attend ($size.*, $color.*), trouvé ${showRaw(v)}.`,
    );
  }
  const [w, c] = v.items;
  if (w === undefined || c === undefined) {
    return bad(
      "E004",
      `border attend ($size.*, $color.*), trouvé ${showRaw(v)}.`,
    );
  }
  const width = convToken("size")(w);
  if (!width.ok) return { ...width, pos: w.pos };
  const color = convToken("color")(c);
  if (!color.ok) return { ...color, pos: c.pos };
  return good([width.value, color.value] as const);
};

export const convRatio: Converter<Ratio> = (v) => {
  if (v.kind !== "tuple" || v.items.length !== 2) {
    return bad(
      "E004",
      `ratio attend (w, h) entiers > 0, trouvé ${showRaw(v)}.`,
    );
  }
  const [w, h] = v.items;
  if (w === undefined || h === undefined) {
    return bad(
      "E004",
      `ratio attend (w, h) entiers > 0, trouvé ${showRaw(v)}.`,
    );
  }
  const positive = convInt(1);
  const a = positive(w);
  if (!a.ok) return { ...a, pos: w.pos };
  const b = positive(h);
  if (!b.ok) return { ...b, pos: h.pos };
  return good([a.value, b.value] as const);
};
