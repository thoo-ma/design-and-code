# ADR-009 — La cible web est React avec CSS Modules

Statut : accepté (tranche la question ouverte n° 4 de la spec §13)

## Contexte

Le backend CSS doit émettre du code dans lequel la zone générée et la zone préservée (ADR-002, §9) sont séparées syntaxiquement, où les slots sont des paramètres typés (§9.3), et que la décompilation peut relire par un parsing de forme. La question 4 demandait s'il fallait viser React avec CSS Modules, ou HTML et CSS purs.

## Options

**(a) HTML + CSS purs.** Universel, sans dépendance, décompilation plus simple. Mais un slot n'y est qu'un trou dans le texte : rien ne vérifie qu'il est fourni, ni avec quel type, et la zone préservée n'a pas de frontière naturelle. La frontière design/code de l'ADR-002 resterait une convention.

**(b) React + CSS Modules.** La zone générée est un composant dont les props sont exactement les slots ; la zone préservée est un autre composant qui l'instancie. Un slot manquant ou mal typé est une erreur du compilateur TypeScript, pas une convention. CSS Modules donne une classe par nœud sans collision, et le fichier `.gen.module.css` reste du CSS lisible, relu par la décompilation. Le coût : une dépendance à React et un sprite d'icônes fourni par le projet.

## Décision

(b), le défaut de la spec, confirmé par l'équipe qui préfère React. Le §9.1 décrit les fichiers, le §11.1 la table de correspondance. Un export HTML statique, s'il est utile un jour, s'obtient en rendant le composant ; il n'est pas une seconde cible.

## Conséquences

- Le compilateur émet `X.gen.tsx`, `X.gen.module.css`, `X.stories.tsx`, et une première version de `X.tsx` (zone préservée) que l'on n'écrit qu'une fois.
- Un fichier de support par projet, `ir-support.tsx`, fournit `Icon` (sprite SVG, nom `web` de `icons.json`, ADR-005) et le type `ImageSource`.
- La décompilation (T8) ne lit que `X.gen.tsx` et `X.gen.module.css`, et n'a besoin que du sous-ensemble de JSX que le compilateur émet.
- Les valeurs d'exemple des slots ne sont pas dans l'IR ; le compilateur les reçoit en option et, à défaut, prend le nom du slot.
