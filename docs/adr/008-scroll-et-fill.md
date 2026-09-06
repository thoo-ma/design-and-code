# ADR-008 — Un `fill` sur l'axe de défilement est une erreur

Statut : accepté (tranche la question ouverte n° 6 de la spec §13)

## Contexte

`overflow: scroll` rend un Stack défilant sur son axe principal (§4.2). Son contenu peut y être plus grand que lui ; le modèle de contraintes (§5.1) traduit cela en une contrainte infinie proposée aux enfants sur cet axe. Que vaut alors un enfant `fill` sur cet axe ?

## Options

**(a) `fill` vaut `hug` sur cet axe, silencieusement.** C'est ce que fait Figma. L'enfant prend la taille de son contenu ; une `Box` vide disparaît. Le design n'a pas dit ce qu'il voulait, et le résultat diffère selon le backend : CSS donnerait à un `flex: 1` le reste de la hauteur visible, SwiftUI donnerait sa taille idéale à une vue sous proposition infinie. La loi 3 serait fausse par construction.

**(b) `fill` vaut la taille visible du Stack.** C'est le comportement de CSS. Un enfant qui remplit la fenêtre visible d'une liste qui défile est un cas rare, et il mélange deux repères, le contenu et la fenêtre, dans un même arbre de contraintes.

**(c) E007.** L'intention est presque toujours floue. On demande au design de la dire : `fixed` pour une hauteur voulue, `hug` pour le contenu, ou retirer `scroll`.

## Décision

(c), le défaut de la spec. E007 est détectée au typecheck quand c'est statiquement décidable, c'est-à-dire pour un enfant `fill` sur l'axe principal d'un Stack `scroll`, à chaque breakpoint, et au layout pour tout autre `fill` sous contrainte infinie. Le Stack `scroll` lui-même peut être `fixed`, `fill` ou `hug` ; `hug` signifie simplement qu'il ne défile jamais.

## Conséquences

- §5.2 : l'axe de défilement propose ∞ aux enfants ; §12 : E007 aux étapes typecheck et layout.
- Le générateur `genIR` ne produit pas ce cas, comme il ne produit pas d'`Image` sans dimension résolvable.
- Un import Figma d'une frame défilante contenant un enfant « fill container » produit un IR que le typecheck refuse avec E007 et le chemin du calque : pas de règle d'import particulière.
