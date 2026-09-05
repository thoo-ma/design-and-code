# ADR-001 — L'IR est la source de vérité

Statut : accepté

## Contexte

Design et code d'une interface divergent en permanence. Figma est un dessin avec des contraintes ajoutées : pas de sémantique, pas d'oracle, format propriétaire. Les outils existants ne résolvent pas le problème — Figma et Stitch n'ont pas de synchronisation réelle avec le code, Paper ne couvre que le web statique. Le mobile natif n'est couvert par rien.

## Options

**(a) Le code est la source de vérité**, l'outil de design édite directement le code (le pari de Paper). C'est l'option concurrente la plus crédible : elle supprime le double référentiel au lieu de le synchroniser, donc elle n'a aucun problème de dérive, et elle demande nettement moins de travail — pas d'IR à définir, pas de compilateur à écrire. Elle est écartée pour une seule raison, mais dirimante : elle repose sur l'existence d'un langage de style universel, ce qui n'est vrai que sur le web. CSS est déjà l'IR du web ; SwiftUI et Compose n'ont pas d'équivalent commun. Choisir (a), c'est renoncer au mobile natif, c'est-à-dire précisément au cas qui a motivé le projet.

**(b) Figma reste la source de vérité** et on améliore l'export. C'est le status quo : conversion lossy sans lois, format propriétaire, pas de versioning.

**(c) Un langage intermédiaire (IR)** textuel et versionnable, dont design et code sont deux projections, avec des lois d'aller-retour vérifiables.

## Décision

(c). C'est la seule option qui rend les lois exprimables, qui couvre le mobile natif, et qui donne un oracle aux agents dès le premier jour.

## Conséquences

Il faut écrire un compilateur (IR → CSS, SwiftUI, Compose) et des importeurs (Figma/Penpot → IR, DOM → IR). L'IR doit rester assez petit pour tenir dans une tête, c'est un critère de design en soi. Risque assumé : le plus petit dénominateur commun, comme les frameworks cross-platform ; mitigé par le fait qu'on vise la fidélité au design-time et un codegen lisible, pas la fidélité au runtime.

## Hors scope

Pas de runtime : l'IR ne s'exécute pas, elle compile vers du code natif que l'humain et les agents éditent ensuite. Pas de canvas ni d'éditeur visuel dans cette phase : l'import depuis un outil existant suffit à démontrer la thèse, et le canvas ne se justifie qu'une fois l'IR validée. Pas de fidélité pixel entre plateformes : deux backends peuvent rendre différemment tant que les lois d'aller-retour tiennent. Pas de génération par IA dans le papier 1 : elle est une conséquence de l'oracle, pas une contribution.
