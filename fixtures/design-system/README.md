# Design system de fixture

Le plus petit design system qui fait compiler `examples/Login.ir`. Il sert aux golden tests, aux tests de propriétés (le générateur `genIR` tire ses tokens ici) et de référence pour les conventions de nommage.

## Fichiers

- `tokens.json` — tokens de base au format DTCG (Design Tokens Community Group). Contient les primitives (palette, familles et graisses de police) et les tokens sémantiques qui les référencent par alias `{chemin}`.
- `tokens.dark.json` — overlay du mode sombre. Ne liste que les feuilles sémantiques qui changent. Fusionné sur `tokens.json` par le compilateur de tokens.
- `icons.json` — jeu d'icônes, avec le nom par backend. Extension hors DTCG.
- `expected/tokens.css`, `expected/Tokens.swift` — sorties attendues du compilateur de tokens. Golden tests.

## Conventions

| IR | DTCG (chemin JSON) | CSS | SwiftUI |
|---|---|---|---|
| `$space.md` | `space.md` | `--space-md` | `T.space.md` |
| `$color.text.primary` | `color.text.primary` | `--color-text-primary` | `T.color.text.primary` |
| `$type.heading.lg` | `type.heading.lg` | classe `.type-heading-lg` | `T.type.heading.lg` + `T.type.metrics.headingLg` |
| `$icon.help` | `icons.help` | `<Icon name="help-circle">` | `T.icon.help` (SF Symbol) |

Règles :
- Un groupe marqué `"$extensions": { "ir": { "referenceable": false } }` est privé : l'IR ne peut pas le référencer (E002). C'est le cas de `color.palette` et de `font`. L'IR ne voit que des tokens sémantiques.
- Les modes (clair, sombre) n'existent pas dans l'IR. Ils sont résolus par le compilateur de tokens : variables CSS sous `[data-theme="dark"]`, `UIColor` dynamique en SwiftUI.
- `bp.compact` et `bp.expanded` sont les deux seuls breakpoints en v0 (ADR-003, spec §4.7). Le compilateur lit le seuil ici et ne le code jamais en dur.
- Les valeurs de dimension utilisent l'unité `px`, qui vaut 1 u de l'IR (spec §2), donc 1 pt SwiftUI et 1 dp Compose.

## Format

Ce fichier suit le format DTCG dans sa forme récente : `$type` et `$value`, dimensions et couleurs sous forme d'objets (`{ "value": 8, "unit": "px" }`, `{ "colorSpace": "srgb", "components": [...], "hex": "..." }`). Si la chaîne d'outils du projet attend la forme ancienne (chaînes `"8px"` et `"#RRGGBB"`), la conversion est une passe triviale, à faire dans le compilateur de tokens plutôt qu'en modifiant les fixtures.

## Ce que ce fichier ne fait pas

- Pas de tokens de composants (`button.primary.bg`, etc.). La couche composants est hors scope v0 ; quand elle arrivera, ses tokens seront des alias vers les sémantiques ci-dessus, dans un fichier séparé.
- Pas de tokens de mouvement (durées, easings). Hors scope v0.
- Pas de troisième breakpoint : deux en v0 (ADR-003).
