# IR de design

Un langage intermédiaire pour les interfaces, dont le design et le code sont deux projections liées par des lois vérifiables.

**Thèse** : le design n'est pas résolu parce qu'il n'est pas encore un langage. Ce dépôt fournit le langage, sa sémantique, ses lois, et les outils qui les respectent.

## Lire dans cet ordre

1. `docs/adr/001-ir-source-de-verite.md` — pourquoi une IR plutôt que Figma ou le code
2. `docs/adr/002-adjonction-et-fragment.md` — les lois, et la frontière design/code
3. `docs/adr/003-layout-dabord.md` — par où on commence
4. `docs/adr/004-dimensions-litterales.md` à `007-identifiants-generes.md` — les questions ouvertes tranchées
5. `docs/spec-ir-v0.md` — la spec du langage
6. `TASKS.md` — le plan de travail
7. `CLAUDE.md` — le contexte pour les agents

## État

Spec v0.1 écrite et précisée au fil des tâches ; questions ouvertes 1, 2, 3, 5, 7 et 8 tranchées (ADR 003 à 007), 4 et 6 restent ouvertes. T0 (bootstrap), T1 (AST, erreurs, schémas zod), T2 (parse, print, loi 0), T3 (forme normale, loi 4 idempotence) et T4 (design system, typecheck) faits dans `ir-core` ; T5 (compilateur de tokens) fait dans `ir-backend-css` et `ir-backend-swiftui`. Tâche courante : T6.

## Structure

```
docs/            spec et ADR
fixtures/        design system minimal (DTCG) et sorties attendues
examples/        écrans .ir de référence
packages/        ir-core, ir-layout-ref, backends, importeurs
```
