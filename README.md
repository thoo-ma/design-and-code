# IR de design

Un langage intermédiaire pour les interfaces, dont le design et le code sont deux projections liées par des lois vérifiables.

**Thèse** : le design n'est pas résolu parce qu'il n'est pas encore un langage. Ce dépôt fournit le langage, sa sémantique, ses lois, et les outils qui les respectent.

## Lire dans cet ordre

1. `docs/adr/001-ir-source-de-verite.md` — pourquoi une IR plutôt que Figma ou le code
2. `docs/adr/002-adjonction-et-fragment.md` — les lois, et la frontière design/code
3. `docs/adr/003-layout-dabord.md` — par où on commence
4. `docs/spec-ir-v0.md` — la spec du langage, qui fait autorité sur tout comportement
5. `TASKS.md` — le plan de travail
6. `CLAUDE.md` — le contexte pour les agents

## Décisions

Une décision structurante est un ADR dans `docs/adr/`. Elles ne se contredisent pas : elles se remplacent par un nouvel ADR.

| # | Décision | Tranche |
|---|---|---|
| 001 | L'IR est la source de vérité | — |
| 002 | Adjonction, pas isomorphisme | — |
| 003 | Le layout comme première couche, un seul backend natif | q7 |
| 004 | Les dimensions de layout acceptent un littéral, l'espacement et le style exigent un token | q3 |
| 005 | Le jeu d'icônes est déclaré dans le design system, avec un nom par backend | q5 |
| 006 | La syntaxe textuelle est canonique, le JSON de l'AST en est dérivé | q2 |
| 007 | Les identifiants générés sont un hash du chemin | q8 |
| 008 | Un `fill` sur l'axe de défilement est une erreur | q6 |
| 009 | La cible web est React avec CSS Modules | q4 |

La colonne « Tranche » renvoie aux questions ouvertes de la spec §13. Les huit sont tranchées ; la q1 (nom et extension du langage) l'a été sans ADR : `.ir` jusqu'au papier.

## État

Spec v0.1 écrite et précisée au fil des tâches. Une ligne par tâche de `TASKS.md` ; la colonne « Loi » dit ce que la tâche démontre de l'oracle (spec §7).

| Tâche | Apport | Package | Loi | État |
|---|---|---|---|---|
| T0 | bootstrap du monorepo, CI | — | — | fait |
| T1 | AST, erreurs typées, schémas zod | `ir-core` | — | fait |
| T2 | parse et print | `ir-core` | L0 | fait |
| T3 | forme normale | `ir-core` | L4 (idempotence) | fait |
| T4 | design system et typecheck | `ir-core` | — | fait |
| T5 | compilateur de tokens | `ir-backend-css`, `ir-backend-swiftui` | — | fait |
| T6 | layout de référence (ADR-008) | `ir-layout-ref` | L3 (moitié référence) | fait |
| T7 | compilateur IR → React + CSS Modules (ADR-009) | `ir-backend-css` | — | fait |
| T8 | décompilateur | `ir-backend-css` | L2, L4 (commutation) | fait |
| T9 | géométrie CSS par Playwright | `ir-backend-css` | L3 (moitié backend) | en cours |
| T10 | importeur DOM | `ir-import-dom` | — | à faire |
| T11 | backend SwiftUI | `ir-backend-swiftui` | L2, L3 | à faire |
| T12 | importeur Figma | `ir-import-figma` | L1 | à faire |

Les lois sont énoncées à la spec §7 ; leurs tests de propriété sont dans le `test/laws.test.ts` de `ir-core`, `ir-layout-ref` et `ir-backend-css`.

## Développement

Node ≥ 22.12, pnpm 10.33 (voir `engines` et `packageManager` du `package.json` racine).

```
pnpm install
pnpm test          # vitest, tous les packages
pnpm typecheck     # tsc, un projet par package
pnpm lint          # eslint
pnpm format:check  # prettier
```

La CI (`.github/workflows/ci.yml`) lance ces quatre vérifications en matrice sur Node LTS. Le markdown, la spec, les fixtures et les exemples sont dans `.prettierignore` : ils s'écrivent à la main et ne sont jamais reformatés.

## Structure

```
docs/            spec et ADR
examples/        Login.ir et ses sorties golden : code compilé, géométrie de référence
fixtures/        design system minimal (DTCG) et sorties attendues du compilateur de tokens
packages/        ir-core, ir-layout-ref, backends, importeurs
```
