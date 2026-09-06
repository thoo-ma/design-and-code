# ADR-004 — Les dimensions de layout acceptent un littéral, l'espacement et le style exigent un token

Statut : accepté (tranche la question ouverte n° 3 de la spec §13)

## Contexte

Le principe 5 de la spec exige un token pour tout ce qui est style ou espacement, et admet un littéral pour les dimensions fixes et les contraintes. La question 3 demandait s'il fallait exiger `$size.*` partout, y compris pour `fixed` et `maxW`.

Un second point, découvert en implémentant T1 à T3 : la spec admettait `$size.*` pour `minW`, `maxW`, `minH`, `maxH` mais seulement un littéral pour `fixed(n)`. Une hauteur de contrôle `fixed($size.control)` est pourtant une décision de système au même titre qu'un `maxW: $size.*`.

## Options

**(a) Tokens partout.** Chaque largeur unique (480, 48) devient un token du design system. Cohérent, mais le design system se remplit de valeurs à usage unique qui ne sont pas des décisions de système, et l'import depuis Figma ou le DOM échoue (E001) sur la moindre largeur non tokenisée. Le taux d'import, qui est une métrique du papier, s'effondrerait pour une raison de discipline, pas de sémantique.

**(b) Littéraux pour les dimensions et contraintes, tokens pour l'espacement et le style**, avec `$size.*` admis partout où un littéral l'est. Une largeur de 480 est une décision de layout locale à l'écran ; un espacement ou une couleur sont des décisions de système. C'est le défaut de la spec, corrigé de son asymétrie sur `fixed`.

**(c) Littéraux partout.** Rompt le principe 5 et la frontière du fragment (ADR-002 : le style passe par un token).

## Décision

(b). `fixed(n)`, `minW`, `maxW`, `minH`, `maxH` acceptent une longueur : un littéral ≥ 0 en u, ou un token `$size.*`. `gap`, `pad` et toutes les propriétés de style exigent un token ; un littéral y est E001.

## Conséquences

- Le type `Size` devient `fixed(longueur) | hug | fill`, où longueur est `number | $size.*` comme pour les contraintes.
- Le typecheck (T4) ne regarde pas les nombres ; il vérifie l'existence et le type DTCG des tokens `$size.*` comme des autres.
- Le layout de référence (T6) résout les tokens `$size.*` en nombres via le design system, ce qu'il fait déjà pour `$space.*`.
- Les importeurs (T10, T12) émettent un littéral pour une dimension non liée à une variable, et un token quand elle l'est. Ils n'émettent jamais de littéral pour un espacement.
