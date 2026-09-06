# ADR-010 — La bordure est décorative, hors du layout

Statut : accepté

## Contexte

La loi 3 (`geometry_css ≈ geometry_ref`) échoue sur le plus petit cas possible : un `Stack` vide avec `border: ($size.hairline, $color.bg.canvas)` mesure `0 × 0` dans `ir-layout-ref` et `2 × 2` dans le navigateur. L'algorithme de référence (§5.2) ne mentionne jamais la bordure : il soustrait le padding, jamais la bordure. Le backend CSS émettait `border: w solid c`, qui, avec `box-sizing: border-box`, ampute la boîte de contenu de deux fois la largeur, et, sans dimension explicite, gonfle la boîte.

Il faut trancher : la bordure prend-elle de la place ?

## Options

1. **La bordure est décorative** : elle ne déplace rien, comme un contour tracé à l'intérieur du rectangle. C'est le défaut de Figma (`stroke` exclu de l'auto-layout, l'inclusion étant une option) et c'est déjà ce que dit §5.2 par omission.
2. **La bordure prend de la place**, comme en CSS : la référence soustrait la bordure en plus du padding. C'est le modèle du Web, et il oblige à ajouter la bordure à l'algorithme, à la forme normale (une bordure de largeur nulle serait un défaut) et à la géométrie de référence.

## Décision

Option 1. La bordure est décorative et n'entre pas dans le layout. Le backend CSS ne peut donc pas utiliser la propriété `border` : il émet un contour interne, `outline: w solid c` avec `outline-offset: calc(-1 * w)`, qui se dessine dans le rectangle sans jamais en changer la géométrie. La réinitialisation du projet (`ir-reset.css`, §9.1) met `border: 0` partout, pour qu'aucune bordure d'agent utilisateur ne déplace la zone générée.

## Conséquences

- §5.2 reste inchangé : c'est le backend qui s'aligne sur la référence, jamais l'inverse (CLAUDE.md).
- §4.2 dit désormais explicitement que la bordure ne prend pas de place, pour qu'on ne le déduise plus d'un silence.
- §11.1 : la ligne `border` devient `outline` plus `outline-offset` ; la décompilation lit les deux et vérifie que le décalage cite le même token que la largeur.
- Une bordure épaisse recouvre le contenu au lieu de le repousser. C'est le comportement de Figma, et le remède est le padding, qui, lui, est dans l'IR.
- Le jour où un backend a besoin d'une bordure qui pousse (Compose, hors scope v0), c'est une propriété nouvelle de l'IR et un ADR, pas une réinterprétation de celle-ci.
