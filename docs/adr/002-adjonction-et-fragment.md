# ADR-002 — Adjonction, pas isomorphisme

Statut : accepté

## Contexte

ADR-001 pose l'IR comme source de vérité, avec design et code comme deux projections. Reste à définir ce que « synchronisé » veut dire. L'intuition de départ était un isomorphisme : aller-retour sans perte dans les deux sens. C'est impossible — le design ignore l'état, la donnée et la logique ; le code ignore l'intention et la hiérarchie visuelle. Les deux mondes n'ont pas les mêmes objets, donc aucune bijection ne peut exister.

## Options

**(a) Viser l'isomorphisme quand même**, en enrichissant le design jusqu'à ce qu'il porte la logique. C'est réinventer un langage de programmation dans un outil de dessin ; ça fait exploser la taille de l'IR et ça contredit le critère « tient dans une tête ».

**(b) Accepter une conversion best-effort sans lois**, c'est-à-dire le status quo des exports actuels. Pas d'oracle, donc pas de harness.

**(c) Une adjonction** : design → code comme construction libre (on ajoute des défauts explicites pour ce que le design ne dit pas), code → design comme foncteur d'oubli (on jette ce que le design ne peut pas représenter). L'aller-retour perd, mais de façon connue, bornée et testable.

## Décision

(c).

## Les deux lois

- **Loi 1** : `design → code → design` est l'identité. Tout ce qu'un design exprime survit à un aller-retour complet.
- **Loi 2** : `code → design → code` est l'identité sur le fragment design-relevant du code. La logique jetée par la projection n'est pas censée revenir ; ce qui est visuel, si.

La spec §7 ajoute L0 (syntaxe), L3 (géométrie) et L4 (normalisation), qui découlent de la même exigence d'oracle.

## Le fragment design-relevant

**Critère.** Une propriété est design-relevant si, à état fixé, la changer change ce que l'utilisateur voit. Elle est code-relevant si la changer change comment l'état évolue. Test opérationnel : une propriété appartient au fragment si et seulement si elle peut être décrite sans référence au temps, aux données ou aux événements. « Rouge » est dans le fragment. « Rouge quand invalide » se décompose : la variante `invalide` est dans le fragment, le « quand » n'y est pas.

**Ce que le design gouverne** (survit aux deux aller-retours) :

1. *Structure* : arbre de composants, slots, ordre des enfants.
2. *Layout* : direction, gap, padding, alignement, mode de dimension (fixe, hug, fill), contraintes min/max, breakpoints.
3. *Style* : tout ce qui passe par un token — couleur, typographie, espacement, rayon, bordure, ombre, opacité. Une valeur brute hors token est une erreur de compilation, pas un style.
4. *Variants et états visuels* : l'apparence de chaque état nommé (default, hover, pressed, focus, disabled, error, loading, empty). L'IR déclare l'existence de l'état et son rendu, jamais sa condition d'entrée.
5. *Contenu d'exemple* : textes et images placeholder, marqués comme tels.
6. *Sémantique* : rôle, niveau hiérarchique, libellé accessible.

**Ce que le code gouverne** : logique et handlers, transitions d'état, validation, données et binding, navigation et routes, i18n runtime, spécificités de plateforme, performance.

**Zone grise, tranchée par règle** :

- *Animations* : durée, easing, propriété animée sont design ; le déclencheur est code.
- *Affichage conditionnel* : l'existence de la variante est design ; la condition est code. L'IR ne contient jamais de `if`.
- *Listes* : le template d'item, l'état vide et l'état de chargement sont design ; la source et le nombre d'items sont code.
- *Texte* : le style, la troncature et la longueur maximale sont design ; la valeur est code, sauf placeholder marqué.

## Conséquences

Le code généré est émis en deux zones séparées syntaxiquement : une zone générée qui contient exactement le fragment, et une zone préservée qui contient la logique et n'est jamais réécrite. La projection code → design ne lit que la zone générée. Le pattern existe déjà partout (ORM, protobuf, GraphQL codegen), donc il est familier aux outils comme aux agents.

La construction libre doit avoir des défauts déterministes : deux compilations du même design donnent le même code, sinon la loi 1 échoue pour de mauvaises raisons. Les tests sont générés (property-based) sur des IR aléatoires bien typées.

## Hors scope

Pas de fusion bidirectionnelle en temps réel : les lois portent sur des aller-retours, pas sur la résolution de conflits d'édition simultanée. Pas de préservation des modifications manuelles du code généré dans cette phase.
