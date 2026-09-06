# ADR-006 — La syntaxe textuelle est canonique, le JSON de l'AST en est dérivé

Statut : accepté (tranche la question ouverte n° 2 de la spec §13, implémentée en T2)

## Contexte

L'IR a deux représentations : la syntaxe humaine de la spec §3 et la sérialisation JSON de l'AST (§3.3). La question 2 demandait s'il fallait garder les deux, ou seulement le JSON, qui économise un parseur.

## Options

**(a) JSON seul.** Pas de parseur ni de printer, un schéma suffit. Mais un écran en JSON n'est pas lisible dans un diff (principe 2), et c'est la forme que ni un humain ni un modèle n'écrit spontanément.

**(b) Les deux, la syntaxe humaine étant canonique.** Le fichier `.ir` est ce qui est commité, relu et diffé ; le JSON est ce que les outils échangent. Le coût est un parseur et un printer, avec la loi 0 pour les tenir.

## Décision

(b). Le texte est la source. `parse` produit l'AST JSON, `print` rend le texte canonique (§3.4), et la loi 0 garantit qu'ils sont inverses l'un de l'autre. Le JSON n'est jamais écrit à la main ; il est validé par les schémas zod.

## Conséquences

- Tout artefact commité est un `.ir` en texte canonique et en forme normale.
- Les importeurs et les décompilateurs produisent un AST, puis `print` ; ils n'écrivent pas de texte eux-mêmes.
- Un changement de syntaxe est un changement de spec, avec sa loi 0 à repasser sur le corpus généré.
