/**
 * Compilateur IR → React + CSS Modules (T7, spec §9.1, §11.1, ADR-009).
 *
 * Quatre textes : la zone générée (`X.gen.tsx`, `X.gen.module.css`), la story
 * (`X.stories.tsx`), et la première version de la zone préservée (`X.tsx`),
 * que l'appelant n'écrit que si elle n'existe pas. Pur : l'appelant écrit les
 * fichiers. Les déclarations CSS suivent l'ordre de la table §11.1, une par
 * ligne, pour que la décompilation soit un parsing de forme.
 */

import {
  BASE_BREAKPOINT,
  fail,
  irError,
  lookupToken,
  ok,
  resolveBreakpoint,
} from "ir-core";
import type {
  DesignSystem,
  IRError,
  Length,
  Node,
  Pad,
  Result,
  Screen,
  Size,
  StackNode,
  Token,
} from "ir-core";

export interface CssCompileOptions {
  readonly designSystem: DesignSystem;
  /** Valeurs d'exemple des slots pour la story et la zone préservée initiale ; défaut : le nom du slot. */
  readonly samples?: Readonly<Record<string, string>>;
}

export interface CssFiles {
  readonly tsx: string;
  readonly css: string;
  readonly stories: string;
  readonly preserved: string;
}

export interface CssOutput {
  /** Noms des fichiers, relatifs au dossier de l'écran (spec §9.1). */
  readonly files: CssFiles;
  /** `X.gen.tsx` : zone générée, composant `XLayout`, props = slots. */
  readonly tsx: string;
  /** `X.gen.module.css` : zone générée, une classe par nœud. */
  readonly css: string;
  /** `X.stories.tsx` : zone générée, story avec les placeholders. */
  readonly stories: string;
  /** `X.tsx` : zone préservée, à écrire une seule fois. */
  readonly preserved: string;
}

type Axis = "w" | "h";
type Decl = readonly [property: string, value: string];

interface Slot {
  readonly name: string;
  readonly type: "string" | "ImageSource";
}

export function fileNames(screenName: string): CssFiles {
  return {
    tsx: `${screenName}.gen.tsx`,
    css: `${screenName}.gen.module.css`,
    stories: `${screenName}.stories.tsx`,
    preserved: `${screenName}.tsx`,
  };
}

/** `my-screen` → `MyScreen` : nom de composant valide. */
export function componentName(screenName: string): string {
  return (
    screenName
      .split(/[-_]/)
      .filter((p) => p.length > 0)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + "Layout"
  );
}

/** Variable CSS d'un token : `$color.text.primary` → `var(--color-text-primary)`. */
export const cssVar = (token: Token): string =>
  `var(--${[token.group, ...token.path].join("-")})`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `s.root`, ou `s["my-id"]` si l'id n'est pas un identifiant JavaScript. */
export const classAccess = (id: string): string =>
  IDENTIFIER.test(id) ? `s.${id}` : `s[${JSON.stringify(id)}]`;

export function compileCss(
  screen: Screen,
  options: CssCompileOptions,
): Result<CssOutput> {
  const ctx = new Compiler(screen, options);
  return ctx.run();
}

class Compiler {
  readonly errors: IRError[] = [];
  private readonly ds: DesignSystem;
  private readonly slots: Slot[] = [];
  private usesIcon = false;

  constructor(
    private readonly screen: Screen,
    private readonly options: CssCompileOptions,
  ) {
    this.ds = options.designSystem;
  }

  run(): Result<CssOutput> {
    const css = this.cssFile();
    const tsx = this.tsxFile();
    if (this.errors.length > 0) return fail(this.errors);
    const files = fileNames(this.screen.name);
    return ok({
      files,
      tsx,
      css,
      stories: this.storiesFile(files),
      preserved: this.preservedFile(files),
    });
  }

  private report(
    code: "E002" | "E004" | "E010",
    path: string,
    message: string,
  ): void {
    this.errors.push(irError(code, path, `${message} (compilateur CSS)`));
  }

  // -- valeurs ----------------------------------------------------------------

  private length(value: Length): string {
    return typeof value === "number" ? `${String(value)}px` : cssVar(value);
  }

  private pad(pad: Pad): string {
    if ("group" in pad) return cssVar(pad);
    return pad.map(cssVar).join(" ");
  }

  private lineHeight(style: Token, path: string): number | undefined {
    const entry = lookupToken(this.ds, style);
    const v = entry?.value;
    const lh =
      typeof v === "object" && v !== null
        ? (v as Readonly<Record<string, unknown>>)["lineHeight"]
        : undefined;
    if (typeof lh !== "number") {
      this.report(
        "E010",
        path,
        `Token $${[style.group, ...style.path].join(".")} sans lineHeight numérique, requis pour maxLines avec truncate: none`,
      );
      return undefined;
    }
    return lh;
  }

  // -- CSS --------------------------------------------------------------------

  private cssFile(): string {
    const header = `/* Généré depuis ${this.screen.name}.ir par ir-backend-css. Ne pas éditer : zone générée (spec §9). */`;
    const base = resolveBreakpoint(this.screen, BASE_BREAKPOINT);
    const breakpoints = [...this.ds.breakpoints.entries()].filter(
      ([name]) => name !== BASE_BREAKPOINT,
    );
    const resolved = breakpoints.map(([name, min]) => ({
      name,
      min,
      screen: resolveBreakpoint(this.screen, name),
    }));

    const rules: string[] = [];
    const visit = (
      node: Node,
      parent: StackNode | undefined,
      others: readonly {
        min: number;
        node: Node;
        parent: StackNode | undefined;
      }[],
      indices: readonly number[],
      path: string,
    ): void => {
      const id = this.keyOf(node, indices);
      const decls = this.declarations(node, parent, indices.length === 0, path);
      rules.push(rule(`.${id}`, decls, ""));
      for (const other of others) {
        const diff = diffDeclarations(
          decls,
          this.declarations(
            other.node,
            other.parent,
            indices.length === 0,
            path,
          ),
        );
        if (diff.length > 0)
          rules.push(
            `@media (min-width: ${String(other.min)}px) {\n${rule(`.${id}`, diff, "  ")}\n}`,
          );
      }
      if (node.type === "Stack") {
        node.children.forEach((child, k) => {
          const childOthers = others.flatMap((o) =>
            o.node.type === "Stack" && o.node.children[k] !== undefined
              ? [{ min: o.min, node: o.node.children[k], parent: o.node }]
              : [],
          );
          visit(
            child,
            node,
            childOthers,
            [...indices, k],
            `${path}/${this.keyOf(child, [...indices, k])}`,
          );
        });
      }
    };
    visit(
      base.root,
      undefined,
      resolved.map((r) => ({
        min: r.min,
        node: r.screen.root,
        parent: undefined,
      })),
      [],
      this.keyOf(base.root, []),
    );
    return `${header}\n\n${rules.join("\n\n")}\n`;
  }

  /** Identifiant de nœud : `#id`, sinon le chemin d'indices (arbre non normalisé). */
  private keyOf(node: Node, indices: readonly number[]): string {
    return node.id ?? `n${indices.join("_")}`;
  }

  /** Déclarations d'un nœud résolu, dans l'ordre de la table §11.1. */
  private declarations(
    node: Node,
    parent: StackNode | undefined,
    isRoot: boolean,
    path: string,
  ): Decl[] {
    const out: Decl[] = [];

    if (node.type === "Text")
      out.push([
        "composes",
        `${[node.props.style.group, ...node.props.style.path].join("-")} from global`,
      ]);
    if (node.type === "Stack") {
      out.push(
        ["display", "flex"],
        ["flex-direction", node.props.dir === "h" ? "row" : "column"],
      );
    }

    const main: Axis | undefined =
      parent === undefined ? undefined : parent.props.dir === "h" ? "w" : "h";
    const sizeOf = (axis: Axis): Size =>
      node.type === "Icon"
        ? { kind: "fixed", value: node.props.size }
        : (node.props[axis] ?? { kind: "hug" });
    for (const axis of ["w", "h"] as const) {
      const prop = axis === "w" ? "width" : "height";
      const size = sizeOf(axis);
      if (isRoot) {
        out.push([
          prop,
          size.kind === "fill"
            ? "100%"
            : size.kind === "hug"
              ? "fit-content"
              : this.length(size.value),
        ]);
        continue;
      }
      const onMain = axis === main;
      if (size.kind === "fixed") {
        out.push([prop, this.length(size.value)]);
        if (onMain) out.push(["flex-shrink", "0"]);
      } else if (size.kind === "hug") {
        if (onMain) out.push(["flex", "0 0 auto"]);
      } else if (onMain) {
        out.push(
          ["flex", "1 1 0"],
          [main === "w" ? "min-width" : "min-height", "0"],
        );
      } else {
        out.push(["align-self", "stretch"]);
      }
    }

    if (node.type !== "Icon") {
      const c = node.props;
      if (c.minW !== undefined) out.push(["min-width", this.length(c.minW)]);
      if (c.maxW !== undefined) out.push(["max-width", this.length(c.maxW)]);
      if (c.minH !== undefined) out.push(["min-height", this.length(c.minH)]);
      if (c.maxH !== undefined) out.push(["max-height", this.length(c.maxH)]);
    }

    if (node.type === "Stack") {
      const sp = node.props;
      if (sp.pad !== undefined) out.push(["padding", this.pad(sp.pad)]);
      if (sp.gap !== undefined) out.push(["gap", cssVar(sp.gap)]);
      const justify = {
        start: undefined,
        center: "center",
        end: "flex-end",
        between: "space-between",
      }[sp.mainAlign ?? "start"];
      if (justify !== undefined) out.push(["justify-content", justify]);
      out.push([
        "align-items",
        {
          start: "flex-start",
          center: "center",
          end: "flex-end",
          stretch: "stretch",
        }[sp.crossAlign ?? "start"],
      ]);
      if (sp.overflow === "clip") out.push(["overflow", "hidden"]);
      if (sp.overflow === "scroll")
        out.push([sp.dir === "h" ? "overflow-x" : "overflow-y", "auto"]);
    }

    if (node.type === "Stack" || node.type === "Box") {
      const st = node.props;
      if (st.bg !== undefined) out.push(["background", cssVar(st.bg)]);
      if (st.radius !== undefined)
        out.push(["border-radius", cssVar(st.radius)]);
      if (st.border !== undefined)
        out.push([
          "border",
          `${cssVar(st.border[0])} solid ${cssVar(st.border[1])}`,
        ]);
      if (st.shadow !== undefined) out.push(["box-shadow", cssVar(st.shadow)]);
      if (st.opacity !== undefined) out.push(["opacity", cssVar(st.opacity)]);
    }

    if (node.type === "Text") {
      const tp = node.props;
      out.push(["color", cssVar(tp.color)]);
      if (tp.align !== undefined && tp.align !== "start")
        out.push(["text-align", tp.align]);
      if (tp.maxLines !== undefined) {
        if ((tp.truncate ?? "end") === "end") {
          out.push(
            ["display", "-webkit-box"],
            ["-webkit-line-clamp", String(tp.maxLines)],
            ["-webkit-box-orient", "vertical"],
            ["overflow", "hidden"],
          );
        } else {
          const lh = this.lineHeight(tp.style, path);
          out.push(
            ["overflow", "hidden"],
            [
              "max-height",
              `calc(${String(tp.maxLines)} * ${String(lh ?? 1)}em)`,
            ],
          );
        }
      }
    }

    if (node.type === "Image") {
      const ip = node.props;
      if (ip.fit === "contain") out.push(["object-fit", "contain"]);
      if (ip.ratio !== undefined)
        out.push([
          "aspect-ratio",
          `${String(ip.ratio[0])} / ${String(ip.ratio[1])}`,
        ]);
      if (ip.radius !== undefined)
        out.push(["border-radius", cssVar(ip.radius)]);
    }

    if (node.type === "Icon") out.push(["color", cssVar(node.props.color)]);
    return out;
  }

  // -- TSX --------------------------------------------------------------------

  private tsxFile(): string {
    const base = resolveBreakpoint(this.screen, BASE_BREAKPOINT);
    const body = this.element(
      base.root,
      undefined,
      [],
      this.keyOf(base.root, []),
      2,
    );
    const name = componentName(this.screen.name);
    const imports = [`import s from "./${fileNames(this.screen.name).css}";`];
    if (this.usesIcon) imports.push(`import { Icon } from "./ir-support";`);
    if (this.slots.some((s) => s.type === "ImageSource"))
      imports.push(`import type { ImageSource } from "./ir-support";`);
    const params =
      this.slots.length === 0
        ? ""
        : `{ ${this.slots.map((s) => s.name).join(", ")} }: { ${this.slots.map((s) => `${s.name}: ${s.type}`).join("; ")} }`;
    return [
      `// Généré depuis ${this.screen.name}.ir par ir-backend-css. Ne pas éditer : zone générée (spec §9).`,
      ...imports,
      "",
      `export function ${name}(${params}) {`,
      "  return (",
      ...body,
      "  );",
      "}",
      "",
    ].join("\n");
  }

  private slot(name: string, type: Slot["type"], path: string): void {
    const seen = this.slots.find((s) => s.name === name);
    if (seen === undefined) this.slots.push({ name, type });
    else if (seen.type !== type)
      this.report("E004", path, `slot(${name}) utilisé avec deux types (§9.3)`);
  }

  private element(
    node: Node,
    parent: StackNode | undefined,
    indices: readonly number[],
    path: string,
    depth: number,
  ): string[] {
    const pad = "  ".repeat(depth);
    const id = this.keyOf(node, indices);
    const attrs: string[] = [
      `className={${classAccess(id)}}`,
      `data-ir=${JSON.stringify(id)}`,
    ];
    const role = node.props.role ?? { kind: "none" };
    const roleAttr = {
      none: undefined,
      heading: undefined,
      button: "button",
      textfield: "textbox",
      list: "list",
      listitem: "listitem",
      image: "img",
      decorative: undefined,
    }[role.kind];
    if (roleAttr !== undefined) attrs.push(`role="${roleAttr}"`);
    if (node.type === "Image") {
      attrs.push(...this.imageAttrs(node, path));
    } else if (node.props.label !== undefined) {
      attrs.push(`aria-label=${attr(node.props.label)}`);
    }
    if (role.kind === "decorative") attrs.push(`aria-hidden="true"`);

    switch (node.type) {
      case "Stack": {
        if (node.children.length === 0)
          return [`${pad}<div ${attrs.join(" ")} />`];
        const children = node.children.flatMap((child, k) =>
          this.element(
            child,
            node,
            [...indices, k],
            `${path}/${this.keyOf(child, [...indices, k])}`,
            depth + 1,
          ),
        );
        return [`${pad}<div ${attrs.join(" ")}>`, ...children, `${pad}</div>`];
      }
      case "Box":
        return [`${pad}<div ${attrs.join(" ")} />`];
      case "Image":
        return [`${pad}<img ${attrs.join(" ")} />`];
      case "Icon": {
        this.usesIcon = true;
        const web = this.ds.icons.get(node.props.name.path.join("."))?.["web"];
        if (web === undefined)
          this.report(
            "E002",
            path,
            `L'icône $icon.${node.props.name.path.join(".")} n'a pas de nom pour le backend web (ADR-005)`,
          );
        return [`${pad}<Icon name=${attr(web ?? "")} ${attrs.join(" ")} />`];
      }
      case "Text": {
        const tag =
          role.kind === "heading"
            ? `h${String(role.level)}`
            : parent?.props.role?.kind === "button"
              ? "span"
              : "p";
        let content: string;
        if (node.content.kind === "slot") {
          this.slot(node.content.name, "string", path);
          content = `{${node.content.name}}`;
        } else {
          content = jsxText(node.content.value);
        }
        return [`${pad}<${tag} ${attrs.join(" ")}>${content}</${tag}>`];
      }
    }
  }

  private imageAttrs(
    node: Extract<Node, { type: "Image" }>,
    path: string,
  ): string[] {
    if (node.content.kind === "slot") {
      this.slot(node.content.name, "ImageSource", path);
      return [
        `src={${node.content.name}.src}`,
        `alt={${node.content.name}.alt ?? ""}`,
      ];
    }
    return [
      `src=${attr(node.content.value)}`,
      `alt=${attr(node.props.label ?? "")}`,
    ];
  }

  // -- story et zone préservée ---------------------------------------------------

  private sample(slot: Slot): string {
    const text = this.options.samples?.[slot.name] ?? slot.name;
    return slot.type === "string"
      ? JSON.stringify(text)
      : `{ src: ${JSON.stringify(text)} }`;
  }

  private storiesFile(files: CssFiles): string {
    const name = componentName(this.screen.name);
    const args = this.slots
      .map((s) => `${s.name}: ${this.sample(s)}`)
      .join(", ");
    return [
      `// Généré depuis ${this.screen.name}.ir par ir-backend-css. Ne pas éditer : zone générée (spec §9).`,
      `import { ${name} } from "./${files.tsx.replace(/\.tsx$/, "")}";`,
      "",
      `export default { title: ${JSON.stringify(this.screen.name)}, component: ${name} };`,
      "",
      `export const Placeholders = {`,
      `  args: {${args.length === 0 ? "" : ` ${args} `}},`,
      `};`,
      "",
    ].join("\n");
  }

  private preservedFile(files: CssFiles): string {
    const name = componentName(this.screen.name);
    const component = name.replace(/Layout$/, "");
    const props = this.slots
      .map(
        (s) =>
          ` ${s.name}={${s.type === "string" ? this.sample(s) : `{ src: ${JSON.stringify(this.options.samples?.[s.name] ?? s.name)} }`}}`,
      )
      .join("");
    return [
      `// Zone préservée (spec §9) : écrit une seule fois par ir-backend-css, jamais réécrit. Votre logique va ici.`,
      `import { ${name} } from "./${files.tsx.replace(/\.tsx$/, "")}";`,
      "",
      `export function ${component}() {`,
      `  return <${name}${props} />;`,
      `}`,
      "",
    ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function rule(
  selector: string,
  decls: readonly Decl[],
  indent: string,
): string {
  const lines = decls.map(([p, v]) => `${indent}  ${p}: ${v};`);
  return `${indent}${selector} {\n${lines.join("\n")}${lines.length > 0 ? "\n" : ""}${indent}}`;
}

/** Déclarations qui changent entre la base et un breakpoint ; `revert` pour celles qui disparaissent. */
export function diffDeclarations(
  base: readonly Decl[],
  other: readonly Decl[],
): Decl[] {
  const out: Decl[] = [];
  const baseMap = new Map(base);
  const otherMap = new Map(other);
  for (const [p, v] of other) if (baseMap.get(p) !== v) out.push([p, v]);
  for (const [p] of base) if (!otherMap.has(p)) out.push([p, "revert"]);
  return out;
}

/** Valeur d'attribut JSX : chaîne entre guillemets, ou `{"…"}` si elle contient un guillemet, une barre oblique inverse ou un retour à la ligne. */
export function attr(value: string): string {
  return /["\\\n\r]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`;
}

/** Texte JSX : nu s'il est sûr, sinon `{"…"}` (spec §11.1). */
export function jsxText(value: string): string {
  const safe =
    value.length > 0 && !/[{}<>&\n\r]/.test(value) && value.trim() === value;
  return safe ? value : `{${JSON.stringify(value)}}`;
}
