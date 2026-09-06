/**
 * Fichier de support du backend CSS, un par projet (spec §9.3, ADR-009) :
 * `Icon` référence le sprite SVG du projet par le nom `web` d'`icons.json`,
 * `ImageSource` est le type d'un slot d'`Image`.
 */
export const SUPPORT_FILE_NAME = "ir-support.tsx";

export const RESET_FILE_NAME = "ir-reset.css";

/**
 * Réinitialisation supposée par la zone générée (spec §9.1), écrite une fois
 * par projet et chargée avant `tokens.css` : le modèle de boîtes de l'IR est
 * celui de `ir-layout-ref` (§5), où une taille est la taille extérieure et où
 * les marges par défaut des agents utilisateurs n'existent pas.
 */
export const RESET_CSS = `/* Réinitialisation du backend CSS, une seule fois par projet (spec §9.1). */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
}

html,
body {
  width: 100%;
  height: 100%;
}

img,
svg {
  display: block;
}
`;

export const SUPPORT_TSX = `// Support minimal du backend CSS, une seule fois par projet (spec §9.3, ADR-009).
import type { SVGProps } from "react";

/** Valeur d'un slot d'Image. */
export interface ImageSource {
  readonly src: string;
  readonly alt?: string;
}

/** Icône du sprite SVG du projet, référencée par son nom web (icons.json). */
export function Icon({ name, ...rest }: { name: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest}>
      <use href={\`#\${name}\`} />
    </svg>
  );
}
`;
