import * as fc from "fast-check";

/**
 * Générateur de fichiers de tokens DTCG minimaux (dimensions, nombres,
 * couleurs), pour les propriétés des compilateurs de tokens. Chaque feuille
 * est rendue avec son chemin pointé et sa valeur, pour servir d'oracle.
 */

export interface TokenLeaf {
  readonly key: string;
  readonly type: "dimension" | "number" | "color";
  readonly value: unknown;
}

export interface GeneratedTokens {
  readonly json: unknown;
  readonly leaves: readonly TokenLeaf[];
}

const genName = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,5}$/);
/** Sous-groupes en majuscule initiale : jamais le nom d'une feuille. */
const genSubName = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{0,5}$/);

const genDimension = fc
  .integer({ min: 0, max: 1000 })
  .map((value) => ({ value, unit: "px" }));
const genNumber = fc.integer({ min: 0, max: 100 }).map((n) => n / 100);
const genColor = fc.integer({ min: 0, max: 0xffffff }).map((n) => {
  const hex = "#" + n.toString(16).padStart(6, "0").toUpperCase();
  return {
    colorSpace: "srgb",
    components: [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255],
    hex,
  };
});

const GROUPS = [
  { name: "space", type: "dimension", gen: genDimension },
  { name: "size", type: "dimension", gen: genDimension },
  { name: "radius", type: "dimension", gen: genDimension },
  { name: "opacity", type: "number", gen: genNumber },
  { name: "color", type: "color", gen: genColor },
] as const;

export const genTokensJson: fc.Arbitrary<GeneratedTokens> = fc
  .uniqueArray(fc.constantFrom(...GROUPS), {
    minLength: 1,
    maxLength: GROUPS.length,
    selector: (g) => g.name,
  })
  .chain((groups) =>
    fc.tuple(
      ...groups.map((group) =>
        fc
          .uniqueArray(
            fc.tuple(
              genName,
              fc.option(genSubName, { nil: undefined }),
              group.gen,
            ),
            {
              minLength: 1,
              maxLength: 4,
              selector: ([name, sub]) => `${sub ?? ""}.${name}`,
            },
          )
          .map((leaves) => ({ group, leaves })),
      ),
    ),
  )
  .map((perGroup) => {
    const json: Record<string, unknown> = {};
    const leaves: TokenLeaf[] = [];
    for (const { group, leaves: items } of perGroup) {
      const node: Record<string, unknown> = { $type: group.type };
      for (const [name, sub, value] of items) {
        const path =
          sub === undefined ? [group.name, name] : [group.name, sub, name];
        if (sub === undefined) {
          node[name] = { $value: value };
        } else {
          const subNode = (node[sub] ??= {}) as Record<string, unknown>;
          subNode[name] = { $value: value };
        }
        leaves.push({ key: path.join("."), type: group.type, value });
      }
      json[group.name] = node;
    }
    return { json, leaves };
  });
