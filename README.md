# IR de design

Un langage intermédiaire pour les interfaces, dont le design et le code sont deux projections liées par des lois vérifiables.

**Thèse** : le design n'est pas résolu parce qu'il n'est pas encore un langage. Ce dépôt fournit le langage, sa sémantique, ses lois, et les outils qui les respectent.

## Lire dans cet ordre

1. `docs/architecture.md` — la carte : les trois mondes, les lois, les packages, en diagrammes
2. `docs/adr/001-ir-source-de-verite.md` — pourquoi une IR plutôt que Figma ou le code
3. `docs/adr/002-adjonction-et-fragment.md` — les lois, et la frontière design/code
4. `docs/adr/003-layout-dabord.md` — par où on commence
5. `docs/spec-ir-v0.md` — la spec du langage, qui fait autorité sur tout comportement
6. `TASKS.md` — le plan de travail
7. `CLAUDE.md` — le contexte pour les agents

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
| 010 | La bordure est décorative, hors du layout | — |
| 011 | `hug` sur un Text est la largeur sans repli, bornée par l'espace offert | — |

La colonne « Tranche » renvoie aux questions ouvertes de la spec §13. Les huit sont tranchées ; la q1 (nom et extension du langage) l'a été sans ADR : `.ir` jusqu'au papier. Les ADR-010 et 011 ne répondent à aucune de ces questions : ce sont les lois qui les ont posées, en montrant qu'un backend ne pouvait pas satisfaire la spec telle qu'elle était écrite.

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
| T9 | géométrie CSS par Playwright (ADR-010, ADR-011) | `ir-backend-css` | L3 (moitié backend) | fait |
| T10 | importeur DOM | `ir-import-dom` | — | en cours |
| T11 | backend SwiftUI | `ir-backend-swiftui` | L2, L3 | à faire |
| T12 | importeur Figma | `ir-import-figma` | L1 | à faire |

Les lois sont énoncées à la spec §7 ; leurs tests de propriété sont dans le `test/laws.test.ts` de `ir-core`, `ir-layout-ref` et `ir-backend-css`, et la loi 3 dans `packages/ir-backend-css/test/geometry/law3.test.ts`, qui demande un navigateur.

## Développement

Node ≥ 22.12, pnpm 10.33 (voir `engines` et `packageManager` du `package.json` racine).

```
pnpm install
pnpm test           # vitest, tous les packages : lois 0, 2 et 4, golden, propriétés
pnpm test:geometry  # loi 3 : la page compilée dans Chromium, comparée au layout de référence
pnpm typecheck      # tsc, un projet par package
pnpm lint           # eslint
pnpm format:check   # prettier
```

`pnpm test:geometry` est à part parce qu'il demande un navigateur : `pnpm --filter ir-backend-css exec playwright install chromium`, ou la variable `IR_CHROMIUM_PATH` si l'environnement en fournit déjà un.

La CI (`.github/workflows/ci.yml`) lance les quatre premières vérifications en matrice sur Node LTS, et la loi 3 dans une tâche à part, qui installe Chromium. Le markdown, la spec, les fixtures et les exemples sont dans `.prettierignore` : ils s'écrivent à la main et ne sont jamais reformatés.

## Structure

`docs/architecture.md` est la carte du projet : l'axe qui va du fichier de design aux pixels avec les lois posées sur les flèches qu'elles contraignent, le pipeline de `ir-core` avec les codes d'erreur sur l'étape qui les émet, la loi 3 en détail, les deux zones du code généré.

```
docs/            spec, ADR et la carte de l'architecture
examples/        Login.ir et ses sorties golden : code compilé, géométrie de référence
fixtures/        design system minimal (DTCG) et sorties attendues du compilateur de tokens
packages/        ir-core, ir-layout-ref, backends, importeurs
```
