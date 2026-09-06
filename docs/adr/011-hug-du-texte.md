# ADR-011 — `hug` sur un Text est la largeur sans repli, bornée par l'espace offert

Statut : accepté

## Contexte

La loi 3 oppose deux définitions du « hug » d'un texte qui se replie.

- L'algorithme de référence, avant cet ADR, mesurait le texte à la largeur offerte par le parent, puis rendait la largeur de la plus longue ligne obtenue. C'est ce que fait Figma quand la largeur est fixe, et c'est un rectangle qui colle au texte.
- CSS ne sait pas faire cela. La largeur d'une boîte qui s'ajuste à son contenu vaut `min(max-content, espace disponible)` : dès que le texte se replie, la boîte occupe tout l'espace offert. Aucune propriété CSS ne rend la largeur de la plus longue ligne après repli.

Un backend CSS ne peut donc pas satisfaire la loi 3 avec la première définition. Et CLAUDE.md est clair : les backends sont jugés contre `ir-layout-ref`, jamais l'inverse — ce qui oblige à corriger la référence quand c'est elle qui exprime quelque chose d'irréalisable, pas à tolérer un écart.

## Options

1. **`hug` = `min(largeur sans repli, espace offert)`**, la règle de CSS. Un texte qui se replie occupe la largeur offerte.
2. **`hug` = largeur de la plus longue ligne**, la règle de Figma. Il faudrait, en CSS, mesurer le texte hors flux puis réinjecter la largeur, c'est-à-dire un runtime : l'IR cesserait d'être compilable en CSS statique.
3. **Interdire `hug` sur un Text dont la largeur est contrainte**, et forcer `fill` ou `fixed`. Cela déplace le problème sur l'auteur du design et casse le cas le plus courant.

## Décision

Option 1. `hug` sur un axe d'un `Text` vaut la largeur du texte sans repli, bornée par l'espace que le parent offre, puis par `minW`/`maxW`. Le texte se replie ensuite dans cette largeur utilisée, et c'est ce repli qui donne la hauteur.

## Conséquences

- §5.2, branche `Text`, réécrite ; l'implémentation de référence mesure deux fois : une fois à l'infini pour la largeur sans repli, une fois à la largeur utilisée pour la hauteur. `TextMeasure` est inchangée.
- Un texte `hug` qui tient sur une ligne ne change pas : `min(tmax, offert) = tmax`. Le seul cas qui change est celui du texte qui se replie, où la boîte devient aussi large que l'espace offert. Rien ne bouge visuellement tant que le texte est aligné au début ; avec `align: center` ou `end`, le texte se centre désormais dans l'espace offert, ce qui est ce qu'un designer attend d'un texte qui se replie.
- Les golden de `examples/` sont inchangés : les textes de `Login` sont étirés par `crossAlign: stretch`, donc en `fill`.
- La même question se posera pour SwiftUI (T11) ; la réponse y est déjà celle-ci, `.frame(maxWidth:)` se comportant comme CSS.
