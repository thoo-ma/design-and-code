# ADR-005 — Le jeu d'icônes est déclaré dans le design system, avec un nom par backend

Statut : accepté (tranche la question ouverte n° 5 de la spec §13)

## Contexte

`Icon` référence une icône par `$icon.nom`. La question 5 demandait si le jeu d'icônes est déclaré dans le design system, ou si SF Symbols sert de jeu universel avec une table de correspondance côté web.

## Options

**(a) SF Symbols comme jeu universel.** Le nom SF Symbol est le nom canonique ; le web le traduit par une table. Élégant sur iOS, mais lie l'IR à un catalogue propriétaire, absent du web et d'Android, dont le nommage change avec les versions d'iOS. L'import depuis le DOM n'a aucun moyen de retrouver un nom SF Symbol.

**(b) Jeu déclaré dans le design system**, une entrée par icône, un nom par backend (`web`, `ios`, `android`). Le design system possède déjà les couleurs et les espacements ; il possède aussi les icônes. L'IR ne connaît que le nom déclaré.

## Décision

(b). Le fichier `icons.json` du design system déclare le jeu. `$icon.nom` doit y exister (E002 sinon, au typecheck). Chaque backend lit le nom qui le concerne ; une icône sans nom pour un backend est E002 à la compilation vers ce backend, pas avant : un design system peut légitimement ne pas encore couvrir une plateforme.

## Conséquences

- Le typecheck valide `$icon.*` contre `icons.json`, pas contre `tokens.json` : le format DTCG n'a pas de type icône, et on ne le redéfinit pas.
- Le compilateur CSS émet `<Icon name="…" />` avec le nom `web`, le sprite étant fourni par la zone préservée. Le compilateur SwiftUI émet `Image(systemName: T.icon.nom)`, la table `T.icon` étant générée depuis `icons.json` par le compilateur de tokens (T5).
- La décompilation retrouve `$icon.nom` par la table inverse du backend ; deux icônes du jeu ne peuvent donc pas partager le même nom sur un backend (vérifié par le compilateur de tokens).
