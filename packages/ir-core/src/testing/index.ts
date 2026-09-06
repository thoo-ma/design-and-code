/**
 * `ir-core/testing` : générateurs d'IR pour les tests de propriétés (spec
 * §8.1). Sous-chemin séparé de l'API : il dépend de fast-check, qui reste
 * une dépendance de test, jamais une dépendance runtime d'`ir-core`.
 */
export * from "./gen.js";
