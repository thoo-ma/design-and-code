# ADR-007 — Les identifiants générés sont un hash du chemin

Statut : accepté (tranche la question ouverte n° 8 de la spec §13, implémentée en T3)

## Contexte

Chaque nœud porte un identifiant stable (principe 7). Un nœud écrit sans `#id` doit en recevoir un en forme normale (§6, règle 6), et cet identifiant se retrouve dans le code généré (`data-ir`, `.irNode`). La question 8 demandait s'il fallait un hash du chemin, qui change quand un frère est inséré avant, ou des identifiants aléatoires figés au premier commit.

## Options

**(a) Identifiants aléatoires figés.** Stables à l'insertion d'un frère, mais non déterministes : deux normalisations du même texte donnent deux résultats, ce qui casse la loi 4 (`N` idempotente et commutante) et le déterminisme de la compilation exigé par l'ADR-002. Les figer suppose un état hors du fichier, ou une réécriture du fichier source par l'outil.

**(b) Hash du chemin d'indices et du type.** Déterministe et sans état : la même structure donne les mêmes identifiants, partout et toujours. Un frère inséré avant renomme les nœuds anonymes qui suivent, ce qui est visible dans le diff et sans conséquence tant que la préservation des modifications manuelles est hors scope (ADR-002).

## Décision

(b). FNV-1a 32 bits de `type:i1/i2/…`, écrit `n_` suivi de huit chiffres hexadécimaux, avec suffixe par le chemin d'indices en cas de collision (§6, règle 6). Les nœuds qui comptent pour le code ou pour les tests portent un `#id` explicite ; le hash ne sert qu'aux nœuds anonymes.

## Conséquences

- Un `#id` explicite est la seule garantie de stabilité à travers une réorganisation. Les golden tests et les exemples nomment leurs nœuds.
- À revoir quand la préservation des modifications manuelles entrera dans le scope : ce jour-là, un identifiant devra survivre à une insertion, et la question de l'état reviendra.
