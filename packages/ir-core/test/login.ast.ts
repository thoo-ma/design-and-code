import type { Screen } from "../src/index.js";

/**
 * AST de `examples/Login.ir` (spec §10.1), écrit à la main pour T1.
 *
 * C'est le seul AST JSON écrit à la main du projet : il sert de golden test
 * pour les types. Dès T2, `parse(examples/Login.ir)` doit produire exactement
 * cette valeur.
 */
export const loginAst: Screen = {
  name: "Login",
  root: {
    type: "Stack",
    id: "root",
    props: {
      dir: "v",
      w: { kind: "fill" },
      h: { kind: "fill" },
      pad: { group: "space", path: ["lg"] },
      gap: { group: "space", path: ["md"] },
      mainAlign: "center",
      crossAlign: "stretch",
      bg: { group: "color", path: ["bg", "canvas"] },
    },
    overrides: [
      {
        breakpoint: "expanded",
        props: { pad: { group: "space", path: ["xl"] }, maxW: 480 },
      },
    ],
    children: [
      {
        type: "Text",
        id: "title",
        props: {
          style: { group: "type", path: ["heading", "lg"] },
          color: { group: "color", path: ["text", "primary"] },
          role: { kind: "heading", level: 1 },
        },
        overrides: [],
        content: { kind: "literal", value: "Bienvenue" },
      },
      {
        type: "Text",
        id: "subtitle",
        props: {
          style: { group: "type", path: ["body", "md"] },
          color: { group: "color", path: ["text", "secondary"] },
          maxLines: 2,
        },
        overrides: [],
        content: { kind: "slot", name: "subtitle" },
      },
      {
        type: "Stack",
        id: "form",
        props: { dir: "v", gap: { group: "space", path: ["sm"] } },
        overrides: [],
        children: [
          {
            type: "Box",
            id: "email",
            props: {
              h: { kind: "fixed", value: 48 },
              bg: { group: "color", path: ["bg", "field"] },
              radius: { group: "radius", path: ["md"] },
              border: [
                { group: "size", path: ["hairline"] },
                { group: "color", path: ["border", "default"] },
              ],
              role: { kind: "textfield" },
              label: "Email",
            },
            overrides: [],
          },
          {
            type: "Box",
            id: "password",
            props: {
              h: { kind: "fixed", value: 48 },
              bg: { group: "color", path: ["bg", "field"] },
              radius: { group: "radius", path: ["md"] },
              border: [
                { group: "size", path: ["hairline"] },
                { group: "color", path: ["border", "default"] },
              ],
              role: { kind: "textfield" },
              label: "Mot de passe",
            },
            overrides: [],
          },
        ],
      },
      {
        type: "Stack",
        id: "actions",
        props: {
          dir: "h",
          gap: { group: "space", path: ["sm"] },
          crossAlign: "center",
        },
        overrides: [],
        children: [
          {
            type: "Stack",
            id: "primary",
            props: {
              dir: "h",
              w: { kind: "fill" },
              h: { kind: "fixed", value: 48 },
              mainAlign: "center",
              crossAlign: "center",
              bg: { group: "color", path: ["accent"] },
              radius: { group: "radius", path: ["md"] },
              role: { kind: "button" },
            },
            overrides: [],
            children: [
              {
                type: "Text",
                id: "primaryLabel",
                props: {
                  style: { group: "type", path: ["label", "md"] },
                  color: { group: "color", path: ["text", "onAccent"] },
                },
                overrides: [],
                content: { kind: "literal", value: "Continuer" },
              },
            ],
          },
          {
            type: "Icon",
            id: "help",
            props: {
              name: { group: "icon", path: ["help"] },
              size: { group: "size", path: ["icon", "md"] },
              color: { group: "color", path: ["text", "secondary"] },
            },
            overrides: [],
          },
        ],
      },
    ],
  },
};
