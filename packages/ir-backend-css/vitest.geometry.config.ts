import { defineConfig } from "vitest/config";

/**
 * Loi 3 côté CSS (spec §8.3) : Chromium, police de test, comparaison à
 * `ir-layout-ref`. Séparée de `pnpm test` parce qu'elle demande un navigateur
 * installé ; la CI a une tâche dédiée.
 */
export default defineConfig({
  test: {
    include: ["test/geometry/**/*.test.ts"],
    // `s.root` doit rendre « root » : la page applique le module CSS généré
    // tel quel, et `composes` est appliqué à la main par le harnais.
    css: { modules: { classNameStrategy: "non-scoped" } },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
