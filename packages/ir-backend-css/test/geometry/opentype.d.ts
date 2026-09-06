/**
 * Surface minimale d'opentype.js utilisée par le générateur de police de test.
 * Le paquet n'expose que son export par défaut et n'embarque pas de types ;
 * on déclare ici exactement ce dont `font.ts` a besoin, rien de plus.
 */
declare module "opentype.js" {
  export class Path {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
  }
  export class Glyph {
    constructor(options: {
      name: string;
      unicode?: number;
      advanceWidth: number;
      path: Path;
    });
  }
  export class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
    });
    toArrayBuffer(): ArrayBuffer;
  }
  const opentype: {
    Path: typeof Path;
    Glyph: typeof Glyph;
    Font: typeof Font;
  };
  export default opentype;
}
