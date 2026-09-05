# ADR-003 — Le layout comme première couche, un seul backend natif

Statut : accepté

## Contexte

ADR-001 fixe l'IR, ADR-002 fixe les lois. Il faut choisir par où commencer l'implémentation. Le fragment design-relevant compte trois couches : tokens, layout, composants. On ne peut pas les attaquer ensemble sans diluer le papier et retarder la première démonstration des lois.

## Options

**(a) Les tokens d'abord.** Le plus simple, mais déjà résolu par la spec DTCG : aucune contribution, et les lois y sont triviales puisque les tokens sont de la donnée pure. Ne prouve rien sur la thèse.

**(b) Les composants d'abord.** Le plus visible, mais un composant présuppose le layout — impossible de définir un `Card` sans savoir comment ses enfants s'empilent. On construirait sur du sable.

**(c) Le layout d'abord.** C'est le cœur dur : auto-layout et Flex/Grid sont deux algèbres de contraintes incompatibles, et c'est là que les exports actuels cassent. Montrer qu'elles se plongent toutes deux dans une algèbre commune, avec les lois qui tiennent, est à la fois la contribution du papier et la démonstration que la thèse est vraie.

## Décision

(c). Les tokens sont adoptés tels quels (DTCG, sans travail), les composants attendent que le layout soit stable.

## Backends

Un seul backend natif au départ, SwiftUI, en plus de CSS. CSS parce qu'il est l'IR de fait du web et permet l'import depuis le DOM, donc le corpus. SwiftUI plutôt que Compose parce que son système de layout est le plus contraint des deux : si l'algèbre commune compile proprement vers SwiftUI, Compose suivra sans surprise. L'inverse n'est pas garanti.

## Conséquences

La spec de l'IR commence par le layout : un modèle de boîtes avec direction, gap, padding, alignement, modes de dimension, contraintes min/max, breakpoints. Les tests de propriétés portent d'abord sur ce sous-ensemble. Le premier livrable démontrable est : un écran importé depuis Figma ou depuis le DOM, compilé vers CSS et SwiftUI, avec les lois vérifiées. Compose vient après validation et sert de test de généralité de l'algèbre.

## Hors scope

Pas de layout absolu ni de positionnement libre : l'IR ne représente que des layouts contraints, et un import qui n'y entre pas échoue explicitement. Pas de Grid dans la première version : Flex-like uniquement. Pas d'animation de layout. Pas de layout dépendant du contenu au runtime au-delà de ce que `hug` exprime. Deux breakpoints maximum en v0 (extension notée comme question ouverte 7 de la spec).
