# Contexte du projet — à lire avant toute tâche

## La thèse

Le design n'est pas résolu parce qu'il n'est pas encore un langage. Il lui manque une sémantique, une représentation textuelle versionnable, un compilateur, un oracle et un corpus. Ce projet fournit ce langage : une IR de design dont le design et le code sont deux projections, liées par une adjonction dont les lois sont testables.

La contribution est le langage et ses lois, pas l'IA. La génération par modèle est une conséquence de l'oracle, pas une partie du papier 1.

## Hiérarchie d'autorité

1. `docs/adr/*.md` — les décisions structurantes. Elles ne se contredisent pas, elles se remplacent par un nouvel ADR.
2. `docs/spec-ir-v0.md` — la spec du langage. Fait autorité sur tout comportement.
3. Ce fichier.
4. Le code.

Si le code contredit la spec, le code a tort. Si une tâche demande quelque chose que la spec ne couvre pas, **s'arrêter et le signaler** plutôt qu'inventer. Une fonctionnalité absente de la spec n'existe pas, même si un backend pourrait la produire.

## Invariants

- L'IR ne contient jamais de `if`, de condition, de donnée ni de logique (ADR-002).
- Style et espacement passent obligatoirement par un token. Un littéral est E001.
- Toute comparaison d'IR se fait sur la forme normale (spec §6).
- Un import qui ne rentre pas dans l'IR échoue avec un code d'erreur et un chemin. Jamais d'approximation silencieuse.
- Le code généré est séparé en zone générée et zone préservée (spec §9). La décompilation ne lit que la zone générée.
- Les backends sont jugés contre `ir-layout-ref`, jamais l'inverse.

## Les lois (spec §7)

- L0 `parse(print(ir)) ≡ ir`
- L1 `import_D(export_D(ir)) ≡ ir`
- L2 `decompile_B(compile_B(ir)) ≡ ir`
- L3 `geometry_B(compile_B(ir), V, M) ≈ geometry_ref(ir, V, M)` à 1 u près
- L4 `N` est idempotente et commute avec import, export, compile, decompile

Ces lois sont l'oracle. Toute PR qui les casse est rejetée, même si les tests unitaires passent.

Ne sont **pas** des lois, ne pas les tester : `export(import(x)) = x` pour un fichier de design quelconque, `compile(decompile(c)) = c` pour un code quelconque.

## Ordre de travail

Spec → tests des lois → implémentation. Jamais l'inverse. Une PR qui ajoute du comportement sans test de propriété correspondant est incomplète.

## Hors scope v0 — ne pas proposer

Layout absolu, rotation, wrap, grid, poids sur `fill`, animation de layout, composants nommés, états visuels, backend Compose, canvas ou éditeur visuel, runtime, fusion bidirectionnelle temps réel, préservation des modifications manuelles, troisième breakpoint, modes de thème dans l'IR.

## Style de code

TypeScript strict, pas de `any`. Fonctions pures dans `ir-core` et `ir-layout-ref` (aucune I/O). Erreurs typées avec code (E001…E010, W001…W003), jamais de `throw` de string. Vitest + fast-check pour les propriétés. Pas de dépendance runtime dans `ir-core` hors zod.

## Packages

| Package | Rôle | Dépend de |
|---|---|---|
| `ir-core` | AST, parse, print, typecheck, forme normale | — |
| `ir-layout-ref` | sémantique de référence du layout (spec §5) | ir-core |
| `ir-backend-css` | compile + decompile CSS/React | ir-core |
| `ir-backend-swiftui` | compile + decompile SwiftUI | ir-core |
| `ir-import-figma` | JSON du plugin Figma → IR | ir-core |
| `ir-import-dom` | DOM sérialisé → IR | ir-core |

## Ce que je possède et ce que tu possèdes

J'écris : la spec, les ADR, les types publics, les décisions d'architecture.
Tu écris : les corps de fonctions, les backends, les générateurs de tests, les fixtures dérivées.

Si tu penses qu'un type public ou une règle de la spec est mauvais, dis-le et propose un ADR. Ne le change pas unilatéralement.
