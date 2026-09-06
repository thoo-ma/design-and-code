/**
 * Design system de fixture (`fixtures/design-system/`), chargé une fois pour
 * les tests de tout le dépôt. Un import JSON statique, pas d'I/O au runtime.
 *
 * Une fixture invalide est une erreur de programmation : ce module échoue à
 * l'import avec le détail des diagnostics, c'est le seul endroit du package
 * qui lève.
 */

import { loadDesignSystem } from "../design-system.js";
import type { DesignSystem } from "../design-system.js";

import fixtureIcons from "../../../../fixtures/design-system/icons.json" with { type: "json" };
import fixtureTokens from "../../../../fixtures/design-system/tokens.json" with { type: "json" };

export { fixtureIcons, fixtureTokens };

const loaded = loadDesignSystem(fixtureTokens, fixtureIcons);
if (!loaded.ok) {
  throw new Error(
    `Design system de fixture invalide :\n${loaded.errors.map((e) => `${e.code} ${e.path} : ${e.message}`).join("\n")}`,
  );
}

export const fixtureDesignSystem: DesignSystem = loaded.value;
