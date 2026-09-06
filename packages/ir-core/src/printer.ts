/**
 * `print` : texte canonique d'un AST (spec §3.4).
 *
 * L'ordre des propriétés est celui de §6 règle 5, écrit en clair ici pour
 * chaque type de nœud. La loi 0 (`parse(print(ir)) ≡ ir`) garantit que ce
 * printer et la table `PROP_SPECS` du parseur restent d'accord.
 */

import type {
  BoxProps,
  CommonProps,
  Content,
  IconProps,
  ImageProps,
  Length,
  Node,
  Overridable,
  Pad,
  Role,
  Screen,
  Size,
  StackProps,
  TextProps,
  Token,
} from "./ast.js";

const WIDTH = 80;
const INDENT = "  ";

export function print(screen: Screen): string {
  const lines: string[] = [`screen ${screen.name} {`];
  printNode(screen.root, 1, lines);
  lines.push("}");
  return lines.join("\n") + "\n";
}

// -- valeurs ----------------------------------------------------------------

const token = (t: Token): string => `$${t.group}.${t.path.join(".")}`;

const length = (l: Length): string =>
  typeof l === "number" ? String(l) : token(l);

const size = (s: Size): string =>
  s.kind === "fixed" ? `fixed(${length(s.value)})` : s.kind;

const role = (r: Role): string =>
  r.kind === "heading" ? `heading(${String(r.level)})` : r.kind;

const pad = (p: Pad): string =>
  Array.isArray(p) ? `(${p.map(token).join(", ")})` : token(p as Token);

const content = (c: Content): string =>
  c.kind === "literal" ? JSON.stringify(c.value) : `slot(${c.name})`;

// -- propriétés, dans l'ordre canonique ---------------------------------------

type Dims = Pick<CommonProps, "w" | "h" | "minW" | "maxW" | "minH" | "maxH">;

function dims(p: Dims, out: string[]): void {
  if (p.w !== undefined) out.push(`w: ${size(p.w)}`);
  if (p.h !== undefined) out.push(`h: ${size(p.h)}`);
  if (p.minW !== undefined) out.push(`minW: ${length(p.minW)}`);
  if (p.maxW !== undefined) out.push(`maxW: ${length(p.maxW)}`);
  if (p.minH !== undefined) out.push(`minH: ${length(p.minH)}`);
  if (p.maxH !== undefined) out.push(`maxH: ${length(p.maxH)}`);
}

function style(p: Overridable<BoxProps>, out: string[]): void {
  if (p.bg !== undefined) out.push(`bg: ${token(p.bg)}`);
  if (p.radius !== undefined) out.push(`radius: ${token(p.radius)}`);
  if (p.border !== undefined)
    out.push(`border: (${token(p.border[0])}, ${token(p.border[1])})`);
  if (p.shadow !== undefined) out.push(`shadow: ${token(p.shadow)}`);
  if (p.opacity !== undefined) out.push(`opacity: ${token(p.opacity)}`);
}

function semantics(
  p: Pick<CommonProps, "role" | "label">,
  out: string[],
): void {
  if (p.role !== undefined) out.push(`role: ${role(p.role)}`);
  if (p.label !== undefined) out.push(`label: ${JSON.stringify(p.label)}`);
}

function stackLines(p: Overridable<StackProps>): string[] {
  const out: string[] = [];
  dims(p, out);
  if (p.dir !== undefined) out.push(`dir: ${p.dir}`);
  if (p.gap !== undefined) out.push(`gap: ${token(p.gap)}`);
  if (p.pad !== undefined) out.push(`pad: ${pad(p.pad)}`);
  if (p.mainAlign !== undefined) out.push(`mainAlign: ${p.mainAlign}`);
  if (p.crossAlign !== undefined) out.push(`crossAlign: ${p.crossAlign}`);
  if (p.overflow !== undefined) out.push(`overflow: ${p.overflow}`);
  style(p, out);
  return out;
}

function boxLines(p: Overridable<BoxProps>): string[] {
  const out: string[] = [];
  dims(p, out);
  style(p, out);
  return out;
}

function textLines(p: Overridable<TextProps>): string[] {
  const out: string[] = [];
  dims(p, out);
  if (p.style !== undefined) out.push(`style: ${token(p.style)}`);
  if (p.color !== undefined) out.push(`color: ${token(p.color)}`);
  if (p.align !== undefined) out.push(`align: ${p.align}`);
  if (p.maxLines !== undefined) out.push(`maxLines: ${String(p.maxLines)}`);
  if (p.truncate !== undefined) out.push(`truncate: ${p.truncate}`);
  return out;
}

function imageLines(p: Overridable<ImageProps>): string[] {
  const out: string[] = [];
  dims(p, out);
  if (p.fit !== undefined) out.push(`fit: ${p.fit}`);
  if (p.ratio !== undefined)
    out.push(`ratio: (${String(p.ratio[0])}, ${String(p.ratio[1])})`);
  if (p.radius !== undefined) out.push(`radius: ${token(p.radius)}`);
  return out;
}

function iconLines(p: Overridable<IconProps>): string[] {
  const out: string[] = [];
  if (p.name !== undefined) out.push(`name: ${token(p.name)}`);
  if (p.size !== undefined) out.push(`size: ${token(p.size)}`);
  if (p.color !== undefined) out.push(`color: ${token(p.color)}`);
  return out;
}

interface Parts {
  readonly props: readonly string[];
  readonly overrides: readonly {
    readonly breakpoint: string;
    readonly props: readonly string[];
  }[];
  readonly content: string | undefined;
}

function parts(node: Node): Parts {
  switch (node.type) {
    case "Stack":
      return {
        props: [...stackLines(node.props), ...semanticsOf(node.props)],
        overrides: node.overrides.map((o) => ({
          breakpoint: o.breakpoint,
          props: stackLines(o.props),
        })),
        content: undefined,
      };
    case "Box":
      return {
        props: [...boxLines(node.props), ...semanticsOf(node.props)],
        overrides: node.overrides.map((o) => ({
          breakpoint: o.breakpoint,
          props: boxLines(o.props),
        })),
        content: undefined,
      };
    case "Text":
      return {
        props: [...textLines(node.props), ...semanticsOf(node.props)],
        overrides: node.overrides.map((o) => ({
          breakpoint: o.breakpoint,
          props: textLines(o.props),
        })),
        content: content(node.content),
      };
    case "Image":
      return {
        props: [...imageLines(node.props), ...semanticsOf(node.props)],
        overrides: node.overrides.map((o) => ({
          breakpoint: o.breakpoint,
          props: imageLines(o.props),
        })),
        content: content(node.content),
      };
    case "Icon":
      return {
        props: [...iconLines(node.props), ...semanticsOf(node.props)],
        overrides: node.overrides.map((o) => ({
          breakpoint: o.breakpoint,
          props: iconLines(o.props),
        })),
        content: undefined,
      };
  }
}

function semanticsOf(p: Pick<CommonProps, "role" | "label">): string[] {
  const out: string[] = [];
  semantics(p, out);
  return out;
}

// -- mise en page (§3.4) ----------------------------------------------------

function printNode(node: Node, depth: number, lines: string[]): void {
  const indent = INDENT.repeat(depth);
  const head = `${node.type}${node.id === undefined ? "" : ` #${node.id}`}`;
  const { props, overrides, content: text } = parts(node);
  const block =
    node.type === "Stack"
      ? node.children.length === 0
        ? "{}"
        : "{"
      : undefined;

  const flatOverrides = overrides.map(
    (o) => `@${o.breakpoint}(${o.props.join(", ")})`,
  );
  const tail = [text, ...flatOverrides, block].filter(
    (x): x is string => x !== undefined,
  );
  const tailText = tail.length === 0 ? "" : ` ${tail.join(" ")}`;

  const single = `${indent}${head} (${props.join(", ")})${tailText}`;
  if (single.length <= WIDTH) {
    lines.push(single);
  } else {
    lines.push(`${indent}${head} (`);
    pushOnePerLine(props, indent, lines);
    const closing = `${indent})${tailText}`;
    if (closing.length <= WIDTH) {
      lines.push(closing);
    } else {
      let line = `${indent})${text === undefined ? "" : ` ${text}`}`;
      for (const o of overrides) {
        lines.push(`${line} @${o.breakpoint}(`);
        pushOnePerLine(o.props, indent, lines);
        line = `${indent})`;
      }
      lines.push(`${line}${block === undefined ? "" : ` ${block}`}`);
    }
  }

  if (node.type === "Stack" && node.children.length > 0) {
    for (const child of node.children) printNode(child, depth + 1, lines);
    lines.push(`${indent}}`);
  }
}

function pushOnePerLine(
  items: readonly string[],
  indent: string,
  lines: string[],
): void {
  items.forEach((item, k) => {
    lines.push(`${indent}${INDENT}${item}${k < items.length - 1 ? "," : ""}`);
  });
}
