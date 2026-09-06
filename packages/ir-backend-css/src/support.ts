/**
 * Fichier de support du backend CSS, un par projet (spec §9.3, ADR-009) :
 * `Icon` référence le sprite SVG du projet par le nom `web` d'`icons.json`,
 * `ImageSource` est le type d'un slot d'`Image`.
 */
export const SUPPORT_FILE_NAME = "ir-support.tsx";

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
