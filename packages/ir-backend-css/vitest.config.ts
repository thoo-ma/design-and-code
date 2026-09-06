import { defineConfig } from "vitest/config";

/**
 * Tests unitaires et de propriétés du backend CSS. La loi 3 vit à part
 * (`vitest.geometry.config.ts`) : elle demande un navigateur.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "test/geometry/**"],
  },
});
