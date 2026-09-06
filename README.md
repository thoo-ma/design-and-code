# IR de design

Un langage intermédiaire pour les interfaces, dont le design et le code sont deux projections liées par des lois vérifiables.

**Thèse** : le design n'est pas résolu parce qu'il n'est pas encore un langage. Ce dépôt fournit le langage, sa sémantique, ses lois, et les outils qui les respectent.

## Lire dans cet ordre

1. `docs/adr/001-ir-source-de-verite.md` — pourquoi une IR plutôt que Figma ou le code
2. `docs/adr/002-adjonction-et-fragment.md` — les lois, et la frontière design/code
3. `docs/adr/003-layout-dabord.md` — par où on commence
4. `docs/adr/004-dimensions-litterales.md` à `011-hug-du-texte.md` — les questions tranchées en cours de route
5. `docs/spec-ir-v0.md` — la spec du langage
6. `TASKS.md` — le plan de travail
7. `CLAUDE.md` — le contexte pour les agents

## État

Spec v0.1 écrite et précisée au fil des tâches ; les huit questions ouvertes de §13 sont tranchées (ADR 003 à 009), et les lois en ont ouvert deux autres, tranchées elles aussi (ADR-010, bordure décorative ; ADR-011, `hug` d'un texte). T0 (bootstrap), T1 (AST, erreurs, schémas zod), T2 (parse, print, loi 0), T3 (forme normale, loi 4 idempotence) et T4 (design system, typecheck) faits dans `ir-core` ; T5 (compilateur de tokens) fait dans `ir-backend-css` et `ir-backend-swiftui` ; T6 (layout de référence, ADR-008) fait dans `ir-layout-ref` ; T7 (compilateur IR → React + CSS Modules, ADR-009), T8 (décompilateur, loi 2 et commutation de la loi 4) et T9 (géométrie CSS par Playwright, loi 3, ADR-010 et ADR-011) faits dans `ir-backend-css`. Tâche courante : T10.

## Structure

```
docs/            spec et ADR
fixtures/        design system minimal (DTCG) et sorties attendues
examples/        écrans .ir de référence
packages/        ir-core, ir-layout-ref, backends, importeurs
```

## Vérifier

```
pnpm test           lois 0, 2 et 4, golden, propriétés — sans navigateur
pnpm test:geometry  loi 3 : la page compilée dans Chromium, comparée au layout de référence
pnpm typecheck && pnpm lint && pnpm format:check
```

`pnpm test:geometry` demande Chromium : `pnpm --filter ir-backend-css exec playwright install chromium`, ou la variable `IR_CHROMIUM_PATH` si l'environnement en fournit déjà un.
