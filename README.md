# IR de design

Un langage intermédiaire pour les interfaces, dont le design et le code sont deux projections liées par des lois vérifiables.

**Thèse** : le design n'est pas résolu parce qu'il n'est pas encore un langage. Ce dépôt fournit le langage, sa sémantique, ses lois, et les outils qui les respectent.

## Lire dans cet ordre

1. `docs/adr/001-ir-source-de-verite.md` — pourquoi une IR plutôt que Figma ou le code
2. `docs/adr/002-adjonction-et-fragment.md` — les lois, et la frontière design/code
3. `docs/adr/003-layout-dabord.md` — par où on commence
4. `docs/spec-ir-v0.md` — la spec du langage
5. `TASKS.md` — le plan de travail
6. `CLAUDE.md` — le contexte pour les agents

## État

Spec v0.1 écrite. T0 (bootstrap) et T1 (AST, erreurs, schémas zod dans `ir-core`) faits. Tâche courante : T2.

## Structure

```
docs/            spec et ADR
fixtures/        design system minimal (DTCG) et sorties attendues
examples/        écrans .ir de référence
packages/        ir-core, ir-layout-ref, backends, importeurs
```
