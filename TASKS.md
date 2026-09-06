# Plan de travail — jusqu'à la première démonstration des lois

Ordre strict. Chaque tâche est un lot de PR. On ne commence pas une tâche tant que la précédente n'a pas ses tests verts.

Règle transverse : **la spec avant les tests, les tests avant le code**. Une PR qui ajoute du comportement sans test de propriété correspondant est incomplète.

Ce fichier dit ce qu'il y a à faire, pas ce qui est fait : l'avancement se lit dans la table d'état du README.

---

## T0 — Bootstrap (aucun comportement)

Monorepo pnpm + TypeScript strict + Vitest + fast-check. Un package par ligne du tableau de `CLAUDE.md`, chacun avec `src/index.ts` vide et un test qui passe. CI GitHub Actions : typecheck, lint, test sur Node LTS. `.editorconfig`, prettier.

Critère de fin : `pnpm -r test` vert sur une PR vide.

---

## T1 — `ir-core` : AST et types d'erreur

Types de l'AST exactement conformes à la spec §3 et §4 : `Screen`, `Node` (union discriminée sur `Stack | Box | Text | Image | Icon`), `Size` (`fixed | hug | fill`), `Token` (typé par groupe), `Override`, `Role`, `Content` (`Literal | Slot`).

Schémas zod correspondants pour la validation de l'AST JSON. Type `IRError` avec code (`E001`…`E010`, `W001`…`W003`), chemin du nœud, position optionnelle, message. Aucun `throw` de string, aucun `any`.

Critère de fin : les types compilent, un AST écrit à la main pour `examples/Login.ir` typecheck, chaque code d'erreur est constructible.

---

## T2 — `ir-core` : parse et print (loi 0)

Parseur descendant récursif de la grammaire spec §3.1, avec positions (ligne, colonne) sur chaque nœud pour les messages d'erreur. `print` produit la forme canonique : indentation 2, ordre des propriétés de la spec §6 règle 5, une propriété par ligne au-delà de 80 colonnes.

Tests : loi 0 (`parse(print(ir)) ≡ ir`) sur `genIR` ; golden test sur `examples/Login.ir` (parse puis print doit redonner le fichier à l'octet près) ; un test par code d'erreur syntaxique (E004, E005).

Critère de fin : L0 verte sur 1000 cas générés.

---

## T3 — `ir-core` : forme normale (loi 4)

Les sept règles de la spec §6, dans l'ordre. Attention à la règle 1 (élimination de fill-in-hug) qui doit émettre W001, et à la règle 6 (identifiants par hash de chemin) qui doit être déterministe.

Tests : idempotence `N(N(x)) ≡ N(x)` sur `genIR` ; chaque règle a son test unitaire avec un cas avant/après explicite.

Critère de fin : L4 (partie idempotence) verte. La partie commutation attend les backends.

---

## T4 — `ir-core` : typecheck contre le design system

Charge `fixtures/design-system/tokens.json`, résout les alias `{chemin}`, construit la table des tokens référençables (exclut les groupes marqués `referenceable: false`). Vérifie que chaque token cité existe et que son groupe correspond au type attendu par la propriété. Émet E001 (littéral là où un token est requis), E002 (token inconnu ou privé), E006 (image sans dimension résolvable).

Critère de fin : `Login.ir` typecheck sans erreur ; une variante fautive par code d'erreur échoue avec le bon chemin.

---

## T5 — Compilateur de tokens

`tokens.json` + `tokens.dark.json` → `tokens.css` et `Tokens.swift`. Golden tests contre `fixtures/design-system/expected/`. Sortie attendue à l'octet près.

Point d'attention : le token typographique composite n'a pas d'équivalent SwiftUI. Il se décompose en `Font` plus métriques (`lineHeight`, `tracking`) appliquées par modificateurs. La table `T.type.metrics` de la fixture est la forme retenue.

---

## T6 — `ir-layout-ref` (loi 3, moitié référence)

L'algorithme de la spec §5.2, en fonctions pures. `measure(node, maxW, maxH)` puis `arrange(node, x, y)`, sortie : `Map<nodeId, {x, y, w, h}>`. `platform.measureText` est un paramètre ; fournir la mesure de test déterministe (police monospace fictive, largeur par caractère fixe, hauteur de ligne = fontSize × lineHeight).

Tests : terminaison et absence de NaN sur `genIR` ; pas de chevauchement entre frères d'un même Stack ; la somme des tailles des enfants plus les gaps plus le padding égale la taille du parent en `hug` ; E007 levée quand un `fill` reçoit une contrainte infinie ; golden test de géométrie sur `Login.ir` à trois viewports (375, 600, 1024).

Critère de fin : géométries golden stables et relues à la main une fois.

---

## T7 — `ir-backend-css` : compile

IR → `.gen.tsx` + `.gen.module.css` selon la table spec §11.1 et la structure §9.1. Golden test contre la sortie de la spec §10.2.

---

## T8 — `ir-backend-css` : decompile (loi 2)

Lit uniquement la zone générée. Parse le CSS Modules et le TSX généré, reconstruit l'IR, normalise.

Tests : L2 sur `genIR` ; L4 (commutation) entre `N` et compile/decompile.

Critère de fin : L2 verte sur 1000 cas. **C'est la première démonstration réelle de la thèse.**

---

## T9 — Géométrie CSS (loi 3, moitié backend)

Playwright, page de test qui monte le composant généré, lecture des `getBoundingClientRect` par `data-ir`. Police de test embarquée avec métriques connues, injectée aussi dans la mesure de référence. Comparaison à 1 u près.

Critère de fin : L3 verte sur les golden examples et sur 200 cas générés.

---

## T10 — `ir-import-dom`

Sérialiseur DOM (Playwright, styles calculés) → IR, avec rejets explicites E003. Métrique de sortie : taux d'import sur un corpus de pages. Cette métrique va dans le papier ; ce n'est pas un test bloquant.

---

## T11 — `ir-backend-swiftui`

Compile + decompile, sous-ensemble SwiftUI de la spec §11.2. La décompilation doit reconnaître les trois motifs (Spacers → `mainAlign`, `.frame(maxWidth: .infinity)` sur tous les enfants → `crossAlign: stretch`, ternaire de size class → surcharge `@expanded`).

Tests L2 sur macOS. L3 par XCTest, hors chemin critique CI mais bloquant avant tag.

---

## T12 — `ir-import-figma`

Plugin Figma qui sérialise l'arbre auto-layout en JSON ; importeur qui consomme ce JSON selon la table spec §11.3. Mode strict et mode `--tolerant`. Tests L1 sur fixtures JSON, sans Figma.

Critère de fin : L1 verte. Avec T8, les deux lois de l'ADR-002 sont démontrées.

---

## Questions ouvertes

Les huit de la spec §13 sont tranchées : ADR-003 à ADR-009, sauf la n° 1 (nom et extension du langage), tranchée sans ADR. Une question qui rouvre donne un nouvel ADR, pas une retouche de celui qui la tranchait.
