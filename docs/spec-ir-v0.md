# Spec de l'IR — v0.1 (couche layout)

Statut : brouillon fondateur. Découle de ADR-001 (l'IR est la source de vérité), ADR-002 (adjonction et lois, fragment design-relevant) et ADR-003 (layout d'abord, backends CSS et SwiftUI).

Ce document est la constitution du projet. Un agent qui doit trancher lit ce document avant d'inventer. Une fonctionnalité absente d'ici n'existe pas encore, même si un backend pourrait la produire.

---

## 0. Portée de la v0.1

Couvert :
- Le modèle de boîtes (Stack, Box, Text, Image, Icon).
- Le dimensionnement (fixe, hug, fill), les contraintes min/max, l'alignement, le débordement.
- Les tokens, par référence à la spec DTCG, sans redéfinition.
- Deux breakpoints (compact, expanded) par surcharge de propriétés.
- La frontière design/code dans la syntaxe (placeholders et slots).
- La forme normale, les lois, la stratégie de test.
- Les tables de correspondance IR ↔ CSS, IR ↔ SwiftUI, IR ← Figma.

Réservé (syntaxe stabilisée, sémantique à venir) :
- Les composants nommés et leurs signatures (props, slots, variants, états).
- Les états visuels sur les feuilles.

Hors scope v0 (ADR-003) :
- Layout absolu, rotation, wrap, grid, poids sur fill, animation de layout.
- Modes de thème dans l'IR : le clair/sombre est une affaire de tokens (modes DTCG), l'IR ne le voit jamais.

---

## 1. Principes

1. **Tient dans une tête.** Cinq types de nœuds, une quinzaine de propriétés. Toute proposition d'ajout doit d'abord montrer qu'elle ne peut pas s'exprimer avec l'existant.
2. **Textuel et versionnable.** Un écran est un fichier `.ir` lisible dans un diff. La sérialisation JSON de l'arbre (AST) en est dérivée mécaniquement ; elle n'est jamais éditée à la main.
3. **Typé.** Chaque propriété a un type. Un fichier `.ir` qui ne type pas ne compile pas.
4. **Aucun `if`.** L'IR décrit ce qui est visible à état fixé. Toute condition est côté code (ADR-002).
5. **Tokens obligatoires pour le style et l'espacement.** Une couleur, une typo, un gap ou un padding littéral est une erreur de compilation. Les dimensions fixes et les contraintes min/max acceptent un littéral, parce qu'une largeur de 480 est une décision de layout, pas de style.
6. **Échec explicite.** Un import qui ne rentre pas dans l'IR échoue avec l'emplacement exact et la raison. Jamais d'approximation silencieuse.
7. **Identité stable.** Chaque nœud porte un identifiant stable qui survit aux aller-retours. C'est ce qui rend les lois testables sur des arbres réels et pas seulement structurellement.

---

## 2. Concepts

**Document.** Un fichier `.ir` décrit exactement un écran (`screen`). Il référence un design system par ses tokens ; il ne les définit pas.

**Nœud.** Un élément de l'arbre. Cinq types :
- `Stack` : conteneur à un axe, seul nœud avec des enfants.
- `Box` : rectangle feuille avec style, sans enfants. Sert de placeholder de composant et de surface.
- `Text` : texte feuille.
- `Image` : image feuille.
- `Icon` : icône feuille, issue du jeu d'icônes du design system.

**Axe.** Un `Stack` a un axe principal (`dir: v` ou `h`) et un axe secondaire. Toutes les règles de dimensionnement sont exprimées par axe.

**Token.** Une référence `$groupe.nom` vers une valeur du design system. Typé par son groupe : `$space.*` (longueur), `$size.*` (longueur), `$color.*`, `$type.*` (typographie composite), `$radius.*`, `$shadow.*`, `$opacity.*`, `$icon.*`.

**Unité.** Une longueur littérale est un nombre en unité `u`, avec la convention : 1 u = 1 px CSS = 1 pt SwiftUI = 1 dp Compose. Les trois sont indépendants de la densité, l'égalité est exacte en pratique.

**Breakpoint.** Une classe de largeur de viewport, nommée, définie par le design system. En v0, exactement deux : `compact` et `expanded`. Un nœud peut surcharger certaines propriétés par breakpoint.

**Placeholder et slot.** Le contenu d'une feuille est soit un littéral (contenu d'exemple fourni par le design, compilé vers les previews, jamais vers la production), soit un `slot(nom)` (valeur fournie par le code). C'est l'endroit précis où la frontière de l'ADR-002 apparaît dans la syntaxe.

---

## 3. Syntaxe concrète

### 3.1 Grammaire

```
document   := "screen" IDENT "{" node "}"
block      := "{" node* "}"
node       := TYPE id? "(" props? ")" content? override* block?
id         := "#" IDENT
props      := prop ("," prop)*
prop       := KEY ":" value
value      := token | number | string | enum | tuple | call
token      := "$" IDENT ("." IDENT)+
tuple      := "(" value ("," value)* ")"
call       := IDENT "(" value ("," value)* ")"
content    := STRING | "slot" "(" IDENT ")"
override   := "@" IDENT "(" props? ")"
```

Lexique :
- `IDENT` : `[A-Za-z_][A-Za-z0-9_-]*`. Sert au nom d'écran, aux `#id`, aux clés, aux valeurs énumérées, aux segments de token, aux noms de slot et de breakpoint.
- `NUMBER` : `[0-9]+ ("." [0-9]+)? ([eE] [+-]? [0-9]+)?`. Jamais de signe : l'IR n'a pas de valeur négative.
- `STRING` : un littéral de chaîne JSON (guillemets doubles, échappements JSON).
- Espaces, tabulations et retours à la ligne séparent les lexèmes et n'ont pas d'autre rôle. Pas de commentaires en v0.

Contraintes hors grammaire :
- Un document contient exactement un nœud racine, de n'importe quel type.
- `block` n'est autorisé que sur `Stack` ; un `Stack` sans bloc n'a pas d'enfant.
- `content` est requis sur `Text` et `Image`, interdit ailleurs.
- Les `override` référencent un breakpoint connu du design system ; un nœud en porte au plus un par breakpoint.
- Les `id` sont uniques dans le document.
- Un nom de slot ne contient pas de tiret : il devient un paramètre dans chaque cible (§9.3). E004.

### 3.2 Exemple minimal

```
screen Hello {
  Stack #root (dir: v, w: fill, h: fill, pad: $space.lg, gap: $space.md, crossAlign: stretch) {
    Text #title (style: $type.heading.lg, color: $color.text.primary, role: heading(1)) "Bonjour"
    Text #body (style: $type.body.md, color: $color.text.secondary) slot(message)
  }
}
```

### 3.3 Sérialisation

L'AST est un JSON dont la forme est la transcription directe de la grammaire. Il est produit par `parse` et consommé par tous les outils. `print(parse(x))` est défini en §7 (loi 0). Personne n'écrit le JSON à la main.

### 3.4 Texte canonique

`print` produit un texte unique pour un AST donné ; c'est la forme sous laquelle un `.ir` est commité (§6). Règles :

1. Indentation de deux espaces par niveau : la racine est indentée d'un niveau sous `screen`, les enfants d'un `Stack` d'un niveau sous lui. Pas de ligne vide. Le fichier se termine par un retour à la ligne.
2. Un nœud s'écrit `TYPE #id (props) content @bp(props) {` sur une ligne, dans cet ordre, parties absentes omises. Les parenthèses des propriétés sont toujours présentes, même vides. Un `Stack` porte toujours son bloc, `{}` s'il est vide.
3. Les propriétés suivent l'ordre canonique de §6 règle 5, séparées par `, `.
4. Si la ligne dépasse 80 caractères, les propriétés du nœud passent à une par ligne, indentées d'un niveau, sans virgule finale, et la parenthèse fermante revient à l'indentation du nœud, suivie du reste de l'en-tête. Si cette ligne de fermeture dépasse encore 80 caractères, les propriétés de chaque surcharge sont dépliées de la même façon.
5. Valeurs : `fixed(48)`, `hug`, `fill` ; `$groupe.chemin` ; `($a, $b)` pour les tuples ; `heading(1)` ; `slot(nom)` ; les nombres dans leur écriture décimale la plus courte ; les chaînes encodées comme en JSON.

---

## 4. Le modèle de boîtes

### 4.1 Propriétés communes à tous les nœuds

| Propriété | Type | Défaut | Note |
|---|---|---|---|
| `w`, `h` | `fixed(n)` \| `hug` \| `fill` | `hug` | Mode de dimension par axe absolu (largeur, hauteur). n est une longueur : littéral ≥ 0 ou `$size.*` (ADR-004). |
| `minW`, `maxW`, `minH`, `maxH` | longueur (littéral ≥ 0 ou `$size.*`) | aucun | Contraintes appliquées après résolution du mode. |
| `role` | `none` \| `heading(n)` \| `button` \| `textfield` \| `list` \| `listitem` \| `image` \| `decorative` | `none` | Sémantique, compilée vers la balise ou le trait d'accessibilité. 1 ≤ n ≤ 6. |
| `label` | string | aucun | Libellé accessible quand le contenu visuel ne suffit pas. |

Les modes de dimension s'interprètent par rapport au parent :
- `fixed(n)` : la dimension vaut n, littéral ou token `$size.*` résolu par le design system, indépendamment du parent et des enfants.
- `hug` : la dimension est la taille intrinsèque du contenu (enfants, texte, image).
- `fill` : la dimension occupe l'espace disponible attribué par le parent. Sans poids en v0 : plusieurs `fill` sur un même axe se partagent l'espace à parts égales.

### 4.2 Stack

| Propriété | Type | Défaut |
|---|---|---|
| `dir` | `v` \| `h` | requis |
| `gap` | `$space.*` | `$space.none` |
| `pad` | `$space.*` \| `($v, $h)` \| `($t, $r, $b, $l)` | `$space.none` |
| `mainAlign` | `start` \| `center` \| `end` \| `between` | `start` |
| `crossAlign` | `start` \| `center` \| `end` \| `stretch` | `start` |
| `overflow` | `visible` \| `clip` \| `scroll` | `visible` |
| `bg` | `$color.*` | aucun |
| `radius` | `$radius.*` | aucun |
| `border` | `($size.*, $color.*)` | aucun |
| `shadow` | `$shadow.*` | aucun |
| `opacity` | `$opacity.*` | aucun |

`mainAlign` n'a d'effet que si le Stack dispose d'espace libre sur son axe principal (c'est-à-dire s'il n'est pas `hug` sur cet axe, ou s'il est `hug` mais contraint par un `minW`/`minH` supérieur à son contenu). `between` avec un seul enfant se comporte comme `start`.

`crossAlign: stretch` force les enfants dont le mode secondaire est `hug` à occuper l'axe secondaire du Stack. Un enfant `fixed` sur l'axe secondaire n'est jamais étiré.

`overflow: scroll` rend le Stack défilant sur son axe principal uniquement.

La bordure est décorative : elle se dessine à l'intérieur du rectangle et ne prend aucune place, ni pour la taille du nœud ni pour l'espace offert à ses enfants (ADR-010). Pour éloigner le contenu du bord, c'est `pad`.

### 4.3 Box

Toutes les propriétés de style de Stack (`bg`, `radius`, `border`, `shadow`, `opacity`), sans `dir`, `gap`, `pad`, alignements ni enfants. Une `Box` en mode `hug` sur un axe a une taille intrinsèque de 0 sur cet axe : une `Box` utile est `fixed` ou `fill`.

### 4.4 Text

| Propriété | Type | Défaut |
|---|---|---|
| `style` | `$type.*` | requis |
| `color` | `$color.*` | requis |
| `align` | `start` \| `center` \| `end` | `start` |
| `maxLines` | entier ≥ 1 | aucun (illimité) |
| `truncate` | `none` \| `end` | `end` si `maxLines`, sinon sans effet |

Contenu : littéral (placeholder) ou `slot(nom)`. Taille intrinsèque : celle du texte mesuré dans le style, avec retour à la ligne si la largeur est contrainte. La mesure du texte est fournie par la plateforme (§5.3). `truncate` n'a d'effet qu'avec `maxLines` : `end` termine la dernière ligne par une ellipse, `none` coupe net.

### 4.5 Image

| Propriété | Type | Défaut |
|---|---|---|
| `fit` | `cover` \| `contain` | `cover` |
| `ratio` | `(w, h)` entiers > 0 | aucun |
| `radius` | `$radius.*` | aucun |

Contenu : littéral (URL ou nom d'asset de placeholder) ou `slot(nom)`. Taille intrinsèque : celle de l'asset si connue, sinon dérivée de `ratio` et de l'autre axe, sinon 0. Le typecheck ne connaît pas les assets : chaque axe d'une `Image` doit donc être résolvable, c'est-à-dire `fixed` ou `fill`, ou dérivé par `ratio` d'un autre axe lui-même `fixed` ou `fill`. Un axe non résolvable, à la base ou à un breakpoint, est une erreur E006. Elle s'évalue sur la forme normale : un `fill` éliminé par la règle 1 de §6 peut la révéler, et c'est voulu, ce `fill` n'avait pas de sens.

### 4.6 Icon

| Propriété | Type | Défaut |
|---|---|---|
| `name` | `$icon.*` | requis |
| `size` | `$size.*` | requis |
| `color` | `$color.*` | requis |

`w` et `h` sont implicitement `fixed(size)` ; ni eux ni les contraintes `minW`, `maxW`, `minH`, `maxH` ne peuvent être exprimés sur une `Icon` (§5.2 retourne `(size, size)` sans contrainte). `role` et `label` restent disponibles. `name` est le contenu de l'`Icon`, comme le texte d'un `Text` : il n'est pas surchargeable par breakpoint (§4.7).

### 4.7 Breakpoints et surcharges

Un `override` `@expanded(...)` remplace, pour ce breakpoint, les propriétés listées. Seules les propriétés de layout et de style sont surchargeables ; `role`, `label`, le contenu (texte, image, `name` d'une `Icon`) et les enfants ne le sont pas. Un écran est donc un seul arbre, jamais deux arbres par breakpoint : la structure est invariante, seules les propriétés varient. C'est une restriction délibérée de la v0, qui garantit que les lois portent sur un objet unique.

Le breakpoint de base (sans `@`) est `compact`. Un nœud sans surcharge a les mêmes propriétés partout. Surcharger le breakpoint de base (`@compact(...)`) est une erreur E004 : ses propriétés sont celles de base. Un breakpoint absent du design system (`$bp.*`) est une erreur E002 au typecheck.

---

## 5. Sémantique de référence du layout

La sémantique est donnée par un algorithme de référence, implémenté une fois, en TypeScript, dans le package `ir-layout-ref`. Il ne rend rien à l'écran ; il calcule la géométrie (position et taille de chaque nœud) pour un viewport donné. Les backends sont jugés contre lui (loi 3).

### 5.1 Modèle

Contraintes descendantes, tailles remontantes. Chaque nœud reçoit de son parent une contrainte `(maxW, maxH)` où chaque composante est un nombre ou `∞`, et retourne une taille `(w, h)`. C'est le modèle commun à Figma auto-layout, à Flutter, à Compose et, moyennant la traduction en flex, à CSS. C'est cette communauté qui rend l'algèbre partagée possible.

### 5.2 Algorithme

Notation. Une contrainte est un nombre ou ∞, avec `min(a, ∞) = a`. Les propriétés d'un nœud sont d'abord résolues pour le breakpoint actif (§4.7 : le breakpoint de plus grand seuil inférieur ou égal à la largeur du viewport), défauts de §4 appliqués, tokens `$space.*` et `$size.*` résolus en nombres par le design system. `available(nœud, axe, max)` est l'espace proposé borné par le nœud lui-même : `min(max, nœud.max<axe>)`. La racine reçoit le viewport comme contrainte sur les axes où elle est `fixed` ou `fill`, et ∞ sur un axe où elle est `hug` : c'est alors son contenu qui décide, et sa boîte peut dépasser le viewport, qui se déroule. C'est `max-content` en CSS. La géométrie produite est l'ensemble des rectangles `(x, y, w, h)` par identifiant de nœud, dans le repère de l'écran, origine en haut à gauche, racine en `(0, 0)`, sans arrondi.

```
measure(node, maxW, maxH) -> (w, h)

  si node est Icon :
     retourner (size, size)                 -- jamais contraint ni étiré (§4.6)

  si node est Text :
     texte = littéral, ou valeur d'exemple du slot (§5.3), ou chaîne vide
     tmin = platform.measureText(texte, style, 0, aucun).w        -- le mot le plus long
     tmax = platform.measureText(texte, style, ∞, aucun).w        -- largeur sans repli
        (les deux largeurs intrinsèques ignorent maxLines, qui ne change pas la largeur)
     w = selon mode w : fixed(n) -> n ; fill -> maxW ; hug -> max(tmin, min(tmax, available(w, maxW)))
     borner w par min/max                                 -- w est la largeur utilisée
     (tw, th) = platform.measureText(texte, style, w, maxLines)   -- le texte se replie dans w
     h = selon mode h : fixed(n) -> n ; fill -> maxH ; hug -> th
        (une feuille fill ne reçoit jamais ∞ en forme normale : son parent lui donne une
        part finie sur main, et la mesure comme hug puis la remesure de l'étape 6 sur cross)
     borner h par min/max ; retourner (w, h)

     `hug` sur un Text est la largeur du texte sans repli, bornée par l'espace offert, jamais
     la largeur de la plus longue ligne après repli (ADR-011), et jamais sous la largeur du mot
     le plus long : un texte ne se replie pas à l'intérieur d'un mot.

  si node est Image ou Box :
     intrinsèque = (0, 0)                   -- l'asset n'est pas connu du layout de référence
     w = selon mode w : fixed(n) -> n ; fill -> maxW ; hug -> intrinsèque.w
     h = selon mode h : fixed(n) -> n ; fill -> maxH ; hug -> intrinsèque.h
     borner par min/max
     si un seul axe est résolu (fixed ou fill) et ratio existe : dériver l'autre de la taille
        bornée, puis le borner à son tour
     retourner (w, h)

  si node est Stack :
     (main, cross) = axes selon dir
     max = (maxW, maxH)                     -- l'espace que le parent propose
     sur un axe où le mode du Stack est fixed ou fill, sa taille ne dépend pas des enfants :
        elle est calculée d'abord (bornée par min/max, puis par le padding) et remplace max
        sur cet axe ; c'est elle qui contraint les enfants, comme une taille définie en CSS
     sur un axe hug, les min/max du Stack ne bornent que sa propre taille, jamais l'espace
        proposé aux enfants : sous un max plus petit, le contenu déborde au lieu de se replier
     innerMax = max(0, max - padding) sur chaque axe   -- jamais négatif, comme une boîte CSS
     si overflow: scroll : innerMax.main = ∞      -- l'axe de défilement propose l'infini (ADR-008)
     disponibleMain = innerMax.main - gap * (nbEnfants - 1)

     Aux étapes 1 à 3, un enfant fill sur cross est mesuré comme hug sur cross :
     sa taille sur cross est provisoire et sera fixée à l'étape 6.

     1. enfants fixed sur main : mesurer avec (fixed, innerMax.cross) ; somme -> S_fixed
     2. enfants hug sur main : mesurer avec (∞ sur main, innerMax.cross) ; somme -> S_hug
        (un enfant hug reçoit la contrainte du Stack sur cross, finie ou non ;
        c'est ce qui fait qu'un texte se replie à la largeur de son parent)
     3. reste = max(0, disponibleMain - S_fixed - S_hug)
        si reste = ∞ et nbFill > 0 : E007 si l'infini vient de overflow: scroll (ADR-008) ;
        sinon il est transitoire (mesure provisoire d'un ancêtre étiré, remesuré à l'étape 6
        avec une contrainte finie) et reste = 0 en attendant, comme flexbox avec une taille
        indéfinie
        si le Stack est hug sur main : reste = 0, il n'y a pas d'espace libre à répartir et
        un enfant fill vaut sa base, zéro (comme flex-basis: 0) ; le cas n'existe que sous
        l'exception de la règle 1 de §6, un parent étiré par son grand-parent
        enfants fill sur main : chacun part de sa base, le padding qu'il porte sur l'axe
        principal (zéro pour une feuille), qui est incompressible et sort de l'espace à
        répartir ; part = (reste - somme des bases) / nbFill ; mesurer avec (base + part,
        innerMax.cross). C'est `flex-basis: 0` en CSS, où le padding n'est pas réparti.
        Si un enfant fill est borné par son min/max sur main, sa taille est gelée à la borne,
        retirée du reste, et les parts des autres sont recalculées. À chaque tour, on ne gèle
        que les enfants dont la violation va dans le sens de la violation totale (positive :
        les minima ; négative : les maxima ; nulle : tous), comme flexbox — sans quoi un
        enfant ramené à son maximum priverait les autres de la place ainsi rendue. Au plus
        nbFill tours. Somme -> S_fill
     4. taille main du Stack (les sommes sont celles obtenues après l'étape 6) :
        fixed(n) -> n
        hug      -> S_fixed + S_hug + S_fill + gaps + padding
        fill     -> max.main   (fini en forme normale, voir l'étape 3 ; E007 sinon)
     5. taille cross du Stack :
        fixed(n) -> n
        hug      -> max des tailles cross de tous les enfants (provisoires pour les fill) + padding
        fill     -> max.cross  (fini en forme normale ; E007 sinon)
     borner par min/max, puis par le padding : un Stack n'est jamais plus petit que son
        padding, qui est incompressible (comme une boîte CSS `border-box`)
     6. innerCross = la taille cross utilisée du Stack moins le padding, bornes min/max
        comprises. Un enfant qui se dimensionne seul ne descend pas sous son minimum de
        contenu (le mot le plus long, pour un texte) et déborde alors, comme en CSS.
        Chaque enfant est remesuré avec cette contrainte :
        en fill s'il est fill sur cross ou si crossAlign: stretch l'étire, dans son propre mode
        sinon ; un enfant déjà mesuré avec cette contrainte ne l'est pas deux fois, un enfant
        fixed sur cross n'est jamais étiré, une Icon non plus. La contrainte main est celle
        d'avant. La taille main du Stack (étape 4) est calculée après cette remesure, sur les
        tailles obtenues : plus large sur cross, un texte a moins de lignes
     retourner (w, h)

arrange(node, x, y) :
  Stack :
     libre = taille.main - padding.main - (S_fixed + S_hug + S_fill + gaps)
     start   : les enfants commencent à padding.start
     center  : décalés de libre / 2 ; end : décalés de libre
        (aussi quand libre < 0 : le contenu déborde des deux côtés ou au début, comme CSS)
     between : libre réparti en nbEnfants - 1 intervalles ajoutés au gap ;
        start si un seul enfant ou si libre < 0
     sur cross, chaque enfant selon crossAlign : start | center | end dans innerCross = max(0, taille.cross - padding.cross) ;
        stretch : déjà dimensionné à l'étape 6, placé à padding.start ; un enfant fill sur cross
        aussi, même si un min/max l'a ramené à une taille plus petite que innerCross
     un Stack scroll place son contenu à partir de padding.start, sans décalage de
        défilement ; le contenu peut déborder de sa taille
     puis récurser
  feuilles : position donnée
```

Deux remarques d'implémentation :
- Le passage 6 est la seule remesure ; elle est bornée (une fois par enfant) et ne fait pas de point fixe. Le gel de l'étape 3 est borné par le nombre d'enfants fill. C'est ce qui garantit la terminaison en O(n) et la prévisibilité.
- Un enfant `fill` sur un axe où son parent est `hug` est éliminé par la forme normale (§6, règle 1), sauf si le parent est étiré sur cet axe par son propre parent. L'algorithme le mesure alors à zéro tant que le parent est mesuré comme `hug` (étape 3), puis le remplit à la remesure de l'étape 6, où le grand-parent a donné au parent une taille : c'est le résultat attendu, `#primary` dans `#actions` en §10.

### 5.3 Mesure de texte

`platform.measureText` est un paramètre de l'algorithme, pas une partie de la spec. Le layout de référence est donc paramétré par une fonction de mesure ; les lois de géométrie (loi 3) sont énoncées à mesure fixée. C'est la formulation honnête de « pas de fidélité pixel entre plateformes » (ADR-001) : la géométrie est identique à mesure égale, et les mesures diffèrent entre plateformes.

Le texte d'un `slot` est la valeur d'exemple fournie au layout, la même que celle des stories et des `#Preview` (§9.3) ; sans valeur, la chaîne vide.

Pour les tests, une mesure déterministe de référence est fournie, qui rend les tests reproductibles sans navigateur ni simulateur : police monospace fictive, largeur de caractère `0,6 × fontSize + letterSpacing`, hauteur de ligne `fontSize × lineHeight`, repli aux espaces, un mot plus long que la largeur disponible occupe sa ligne et déborde, les espaces en fin de ligne débordent au lieu de provoquer un repli (ils pendent, comme en CSS) et comptent dans la largeur de la dernière ligne, au plus `maxLines` lignes, texte vide de hauteur nulle.

---

## 6. Forme normale

Toute comparaison d'IR (dans les lois, dans les tests, dans les diffs) se fait sur la forme normale `N(ir)`. `N` est idempotente : `N(N(x)) = N(x)`.

Règles, appliquées dans cet ordre :

1. **Élimination de fill-in-hug.** Un enfant `fill` sur un axe où son parent Stack est `hug` sur le même axe devient `hug`, sauf si ce parent est lui-même étiré sur cet axe par son propre parent (`crossAlign: stretch` du grand-parent, l'axe étant l'axe secondaire du grand-parent) : un Stack étiré dispose de l'espace et ses enfants `fill` le remplissent, c'est le cas de `#primary` dans `#actions` en §10. La règle s'évalue breakpoint par breakpoint sur les propriétés résolues (base plus surcharge), et le résultat est réencodé en base plus surcharges. Chaque changement produit un avertissement W001. (Figma applique la même règle silencieusement.)
2. **Élimination des défauts.** Toute propriété de base égale à sa valeur par défaut est omise. L'égalité est sémantique : `pad: ($space.none, $space.none)` vaut le défaut, et `label: ""` vaut l'absence de label (un nom accessible vide n'en est pas un ; ARIA l'ignore, et le code généré ne distingue pas les deux). Une propriété n'est omise que si sa résolution (défauts de §4 compris, dont celui de `truncate`) est la même à chaque breakpoint avec et sans elle.
3. **Élimination des surcharges vides.** Une propriété de surcharge dont la résolution au breakpoint est la même avec et sans elle est omise. Un `@bp(...)` devenu vide est supprimé, avec un avertissement W003.
4. **Résolution de `truncate`.** `truncate` n'a de sens qu'aux breakpoints où `maxLines` est résolu (§4.4), et y vaut `end` par défaut. `N` l'écrit là où il agit : la base porte `truncate: none` si et seulement si `maxLines` y est résolu et que la valeur y est `none` ; une surcharge porte `truncate` si et seulement si `maxLines` y est résolu et que la valeur y diffère de celle que la base lui donne (`end` si la base n'en porte pas). Partout ailleurs `truncate` est omis. Un `truncate: none` écrit à la base sans `maxLines`, pour une surcharge qui ajoute `maxLines`, est donc déplacé dans cette surcharge : deux IR de même sens ont une seule forme normale, ce que la loi 2 exige d'un décompilateur qui ne voit que des valeurs résolues.
5. **Ordre canonique des propriétés.** L'ordre est celui des tables de §4, `w`/`h` d'abord, puis contraintes, puis propriétés du type, puis style, puis `role`/`label`.
6. **Identifiants.** Un nœud sans `#id` reçoit `#n_<hash>`, où le hash est FNV-1a 32 bits, sur huit chiffres hexadécimaux, de la chaîne `type:i1/i2/…` formée de son type et de son chemin d'indices depuis la racine (chemin vide pour la racine, donc `Stack:`). Déterministe, donc stable tant que la structure ne change pas. Si l'identifiant obtenu existe déjà dans le document, le chemin d'indices lui est ajouté en suffixe (`_i1_i2`), autant de fois que nécessaire.
7. **Padding.** `pad: ($a, $b, $a, $b)` devient `pad: ($a, $b)`, puis `pad: ($a, $a)` devient `pad: $a`. Deux tokens sont égaux s'ils ont le même groupe et le même chemin.

Les règles sont indépendantes de leur ordre d'application ; l'ordre ci-dessus est celui de l'implémentation de référence. `N` est totale sur un AST bien typé : elle ne peut pas échouer, elle rend l'arbre normalisé et ses avertissements.

La forme normale est la sortie de tous les importeurs et de tous les décompilateurs. Le fichier `.ir` commité est toujours en forme normale ; un hook de pre-commit l'assure, et le golden test de `examples/` le vérifie.

---

## 7. Lois

Notation : `ir` désigne un document en forme normale. `≡` est l'égalité structurelle après `N`.

**Loi 0 — Syntaxe.** `parse(print(ir)) ≡ ir`, et `print(parse(s))` est le texte canonique (§3.4) de `parse(s)` pour tout `s` valide. `print` ne normalise pas : le texte commité est `print(N(parse(s)))`.

**Loi 1 — Design.** Pour tout outil de design D disposant d'un importeur et d'un exporteur : `import_D(export_D(ir)) ≡ ir`. Tout ce que l'IR exprime survit à un passage par l'outil de design.

**Loi 2 — Code.** Pour tout backend B : `decompile_B(compile_B(ir)) ≡ ir`. La décompilation ne lit que la zone générée (§9). Tout ce que l'IR exprime survit à un passage par le code.

**Loi 3 — Géométrie.** Pour tout backend B, tout viewport V et une mesure de texte M fixée : `geometry_B(compile_B(ir), V, M) ≈ geometry_ref(ir, V, M)`, où `≈` est l'égalité à 1 u près sur chaque coordonnée. C'est la loi qui dit que le compilateur est correct, pas seulement réversible.

**Loi 4 — Normalisation.** `N(N(ir)) ≡ N(ir)` et, pour toute opération O parmi import, export, compile, decompile : `N(O(ir)) ≡ O(N(ir))`. Les outils commutent avec la forme normale. Pour `compile`, dont la sortie n'est pas une IR, la commutation se lit `compile_B(ir) = compile_B(N(ir))` : un compilateur normalise son entrée (il a besoin des identifiants de la règle 6 de §6) et deux IR de même forme normale donnent le même code, à l'octet près. Pour `decompile`, elle se lit `N(decompile_B(c)) ≡ decompile_B(c)` : la sortie d'un décompilateur est déjà normale (§6). Avec la loi 2, cela donne `decompile_B(compile_B(x)) ≡ N(x)` pour toute IR bien typée `x`, normale ou non.

Ce qui n'est pas une loi et ne doit pas être testé comme telle :
- `export_D(import_D(x)) = x` pour un fichier de design `x` quelconque. Le sens design → IR → design n'est pas l'identité, par construction (le design contient des choses que l'IR jette, comme des calques absolus).
- `compile_B(decompile_B(c)) = c` pour un code `c` quelconque. Même raison, côté code.

---

## 8. Stratégie de test

### 8.1 Tests de propriétés

Un générateur `genIR(designSystem, profondeur ≤ 5, largeur ≤ 4)` produit des arbres bien typés, en forme normale, avec tokens tirés d'un design system de fixture. Il inclut délibérément les cas limites : Stack vide, Text vide, Stack sans enfants avec `between`, `fill` multiples, `hug` imbriqués, surcharges partielles.

Chaque loi est un test de propriété sur `genIR` avec shrinking. Le shrinking produit le plus petit contre-exemple, qui est ajouté aux golden tests (§8.2) une fois corrigé.

### 8.2 Golden tests

Un dossier `examples/` avec des écrans écrits à la main (dont celui de §10), et pour chacun : la sortie CSS attendue, la sortie SwiftUI attendue, la géométrie de référence à trois viewports. Un changement de sortie est un changement de spec et se relit comme tel.

### 8.3 Géométrie des backends (loi 3)

- CSS : Playwright, page compilée, lecture des `getBoundingClientRect` par `data-ir`, comparaison à `geometry_ref` à 1 u près, sur les golden de `examples/` et sur 200 IR tirées de `genIR`. La page est la sortie du compilateur, plus ce qu'un projet fournit une fois : `tokens.css`, `ir-reset.css` (§9.1) et `ir-support.tsx`. La police est construite pour le test : chaque glyphe avance exactement `0,6 em`, la valeur de `monospaceMeasure` (§5.3), si bien que le navigateur et la mesure de référence mesurent le même texte de la même façon — c'est le « à mesure fixée » de la loi 3. Le corpus se limite donc aux caractères couverts par cette police, un caractère hors alphabet tombant sur une police de repli aux métriques inconnues.

  Trois substitutions appartiennent au harnais et non au compilateur : la famille de police des tokens devient celle du test ; le `src` des images devient un PNG 1×1 transparent, l'asset n'étant pas dans l'IR (la référence lui donne une taille intrinsèque nulle et aucun axe n'en dépend, §4.5) ; les barres de défilement sont masquées, le modèle de référence n'en ayant pas.
- SwiftUI : cible de test XCTest qui héberge la vue compilée, lit les frames via `GeometryReader` injecté par l'identifiant `.irNode`, compare. Plus lourd ; s'exécute sur macOS uniquement, hors du chemin critique CI Linux, mais bloquant avant un tag.

### 8.4 Importeurs

- DOM → IR : Playwright sur un corpus de pages, extraction des boîtes flex, tentative d'import, classification du résultat (importé / rejeté avec code d'erreur). Le taux d'import est une métrique du papier, pas un test.
- Figma → IR : plugin qui sérialise l'arbre auto-layout en JSON ; l'importeur consomme ce JSON. Les tests tournent sur des fixtures JSON, sans Figma.
- Penpot → IR : format de fichier ouvert, importeur direct. Sert de terrain de test hors ligne pour la loi 1 quand Figma n'est pas disponible.

---

## 9. Structure du code généré

Principe (ADR-002) : deux zones séparées syntaxiquement. La zone générée contient exactement le fragment design-relevant et est régénérée à chaque compilation. La zone préservée contient la logique et n'est jamais écrite par le compilateur après sa création initiale.

### 9.1 Backend CSS (cible React + CSS Modules en v0)

```
Login.ir
Login.gen.tsx        zone générée : composant LoginLayout, props = slots, data-ir sur chaque nœud
Login.gen.module.css zone générée : une classe par nœud, tokens via variables CSS
Login.tsx            zone préservée : composant Login, logique, passe les slots à LoginLayout
Login.stories.tsx    zone générée : story avec les placeholders
```

`Login.tsx` est écrit une seule fois, à la première compilation, puis jamais réécrit. Un fichier `ir-support.tsx`, un par projet, fournit `Icon` (sprite SVG, noms `web` de `icons.json`) et le type `ImageSource` (ADR-009).

La zone générée suppose une réinitialisation, `ir-reset.css`, elle aussi écrite une fois par projet et chargée avant `tokens.css` : `box-sizing: border-box`, marges, paddings et bordures d'agent utilisateur à zéro, `img` et `svg` en `display: block`. Le modèle de boîtes de l'IR est celui de §5, où une taille est la taille extérieure et où un `<p>` n'a pas de marge.

`decompile_css` lit `Login.gen.tsx` et `Login.gen.module.css` uniquement, avec le design system, et rend la forme normale. C'est un parsing de forme, l'inverse de la table §11.1 : le nom de l'écran est celui du module CSS importé (`./Login.gen.module.css`) ; l'arbre est l'imbrication des éléments ; chaque nœud porte son `data-ir` et la règle du même nom ; le type se lit sur la balise et sur `display: flex` (un `<div>` sans lui est une `Box`) ; les propriétés se lisent sur les déclarations de la règle, le contenu, `role` et `label` sur l'élément. Chaque bloc `@media (min-width: n px)` désigne le breakpoint du design system de seuil n ; les déclarations effectives à ce breakpoint sont celles de la base recouvertes par le bloc (`revert` retire), et la surcharge est la différence entre les propriétés résolues à ce breakpoint et celles de la base, que `N` réencode. Tout ce qui sort de ces formes est E003, avec le chemin du nœud et ce qui a été trouvé ; un token, une icône ou un seuil inconnus du design system sont E002 ; un `data-ir` dupliqué est E005. Le décompilateur ne devine jamais : une déclaration ou un attribut qu'il ne sait pas lire est une erreur, pas un oubli.

### 9.2 Backend SwiftUI

```
Login.ir
LoginLayout.gen.swift   zone générée : struct LoginLayout, paramètres = slots, .irNode("id"), #Preview avec placeholders
LoginView.swift         zone préservée : struct LoginView, @State, logique, instancie LoginLayout
```

`decompile_swiftui` lit `LoginLayout.gen.swift` uniquement. Le fichier généré n'utilise que le sous-ensemble de SwiftUI listé dans §11.2, ce qui rend la décompilation un parsing de forme, pas une analyse sémantique.

### 9.3 Slots

Un `slot(nom)` sur un `Text` devient un paramètre `nom: String`. Sur une `Image`, un paramètre `nom: ImageSource` (type défini dans un support library minimal, un fichier par backend). Le nom d'un slot est donc un identifiant dans chaque cible : sans tiret (§3.1, E004 au parse), et jamais un mot réservé de la cible ni un nom que le fichier généré utilise déjà (`s`, `Icon`, `ImageSource` en React) : E004 à la compilation du backend concerné. Deux slots de même nom désignent le même paramètre et doivent être du même type (E004 au typecheck). Les valeurs d'exemple des slots ne sont pas dans l'IR : le compilateur les reçoit en option pour la story ou le `#Preview`, et prend le nom du slot à défaut. Un slot non fourni par la zone préservée est une erreur de compilation du langage cible, pas de l'IR : c'est le système de types du code qui garde cette frontière.

### 9.4 Identifiants

Chaque nœud est marqué par son `#id` dans le code généré (`data-ir="id"` en HTML, `.irNode("id")` en SwiftUI). C'est ce marquage qui permet la loi 2 sur des arbres réels et la loi 3 par lecture de géométrie.

---

## 10. Exemple complet

### 10.1 Source

Le texte ci-dessous est la forme canonique de §3.4, telle que `print` l'écrit et telle que `examples/Login.ir` est commité ; les deux sont identiques à l'octet près.

```
screen Login {
  Stack #root (
    w: fill,
    h: fill,
    dir: v,
    gap: $space.md,
    pad: $space.lg,
    mainAlign: center,
    crossAlign: stretch,
    bg: $color.bg.canvas
  ) @expanded(maxW: 480, pad: $space.xl) {
    Text #title (
      style: $type.heading.lg,
      color: $color.text.primary,
      role: heading(1)
    ) "Bienvenue"
    Text #subtitle (
      style: $type.body.md,
      color: $color.text.secondary,
      maxLines: 2
    ) slot(subtitle)
    Stack #form (dir: v, gap: $space.sm, crossAlign: stretch) {
      Box #email (
        h: fixed(48),
        bg: $color.bg.field,
        radius: $radius.md,
        border: ($size.hairline, $color.border.default),
        role: textfield,
        label: "Email"
      )
      Box #password (
        h: fixed(48),
        bg: $color.bg.field,
        radius: $radius.md,
        border: ($size.hairline, $color.border.default),
        role: textfield,
        label: "Mot de passe"
      )
    }
    Stack #actions (dir: h, gap: $space.sm, crossAlign: center) {
      Stack #primary (
        w: fill,
        h: fixed(48),
        dir: h,
        mainAlign: center,
        crossAlign: center,
        bg: $color.accent,
        radius: $radius.md,
        role: button
      ) {
        Text #primaryLabel (
          style: $type.label.md,
          color: $color.text.onAccent
        ) "Continuer"
      }
      Icon #help (
        name: $icon.help,
        size: $size.icon.md,
        color: $color.text.secondary
      )
    }
  }
}
```

Note : `#form` porte `crossAlign: stretch` parce que ses champs, des `Box` sans contenu, sont `hug` en largeur et auraient sinon une largeur nulle ; c'est le calcul de la géométrie de référence qui l'a révélé. `#email` et `#password` sont des `Box` avec `role: textfield` parce que les composants sont hors scope v0. Quand la couche composants arrivera, ces deux nœuds deviendront `Field(variant: outlined)` et le reste de l'écran ne changera pas. C'est le test de la restriction « le layout d'abord » : elle ne doit pas coûter de réécriture plus tard.

### 10.2 Sortie CSS (extrait)

Extraits verbatim de `examples/Login.gen.module.css` et `examples/Login.gen.tsx`, tels que `ir-backend-css` les produit ; le golden test vérifie que chaque bloc ci-dessous est un extrait de la sortie.

```css
.root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--space-lg);
  gap: var(--space-md);
  justify-content: center;
  align-items: stretch;
  background: var(--color-bg-canvas);
}

@media (min-width: 600px) {
  .root {
    max-width: 480px;
    padding: var(--space-xl);
  }
}
```

```css
.form {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: var(--space-sm);
  align-items: stretch;
}
```

```css
.email {
  height: 48px;
  flex-shrink: 0;
  background: var(--color-bg-field);
  border-radius: var(--radius-md);
  outline: var(--size-hairline) solid var(--color-border-default);
  outline-offset: calc(-1 * var(--size-hairline));
}
```

```css
.actions {
  display: flex;
  flex-direction: row;
  flex: 0 0 auto;
  gap: var(--space-sm);
  align-items: center;
}
```

```css
.primary {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-width: 0;
  height: 48px;
  justify-content: center;
  align-items: center;
  background: var(--color-accent);
  border-radius: var(--radius-md);
}
```

```tsx
export function LoginLayout({ subtitle }: { subtitle: string }) {
  return (
    <div className={s.root} data-ir="root">
      <h1 className={s.title} data-ir="title">Bienvenue</h1>
      <p className={s.subtitle} data-ir="subtitle">{subtitle}</p>
      <div className={s.form} data-ir="form">
        <div className={s.email} data-ir="email" role="textbox" aria-label="Email" />
        <div className={s.password} data-ir="password" role="textbox" aria-label="Mot de passe" />
      </div>
      <div className={s.actions} data-ir="actions">
        <div className={s.primary} data-ir="primary" role="button">
          <span className={s.primaryLabel} data-ir="primaryLabel">Continuer</span>
        </div>
        <Icon name="help-circle" className={s.help} data-ir="help" />
      </div>
    </div>
  );
}
```

Le littéral "Bienvenue" est compilé en dur parce que c'est un placeholder sur un nœud sans slot : il est design-owned. Si le titre devait venir des données, le design l'aurait écrit `slot(title)`. Les champs `#email` et `#password`, `fixed` en hauteur sur l'axe principal de `#form`, portent `flex-shrink: 0` ; `#primary`, `fill` sur l'axe principal de `#actions`, porte `flex: 1 1 0` et `min-width: 0` : sans ces deux déclarations, CSS rétrécirait là où le layout de référence ne rétrécit pas.

### 10.3 Sortie SwiftUI (extrait)

```swift
struct LoginLayout: View {
  let subtitle: String

  var body: some View {
    VStack(alignment: .center, spacing: T.space.md) {
      Spacer(minLength: 0)
      Text("Bienvenue")
        .font(T.type.heading.lg).foregroundStyle(T.color.text.primary)
        .accessibilityAddTraits(.isHeader)
        .irNode("title")
      Text(subtitle)
        .font(T.type.body.md).foregroundStyle(T.color.text.secondary)
        .lineLimit(2)
        .irNode("subtitle")
      VStack(spacing: T.space.sm) {
        RoundedRectangle(cornerRadius: T.radius.md)
          .fill(T.color.bg.field)
          .frame(height: 48)
          .overlay(RoundedRectangle(cornerRadius: T.radius.md)
                     .stroke(T.color.border.default, lineWidth: T.size.hairline))
          .accessibilityLabel("Email")
          .irNode("email")
        // password : idem
      }
      .irNode("form")
      HStack(alignment: .center, spacing: T.space.sm) {
        HStack { Text("Continuer").font(T.type.label.md).foregroundStyle(T.color.text.onAccent) }
          .frame(maxWidth: .infinity)
          .frame(height: 48)
          .background(T.color.accent, in: RoundedRectangle(cornerRadius: T.radius.md))
          .accessibilityAddTraits(.isButton)
          .irNode("primary")
        Image(systemName: T.icon.help).font(.system(size: T.size.icon.md))
          .foregroundStyle(T.color.text.secondary)
          .irNode("help")
      }
      .irNode("actions")
      Spacer(minLength: 0)
    }
    .padding(sizeClass == .compact ? T.space.lg : T.space.xl)
    .frame(maxWidth: sizeClass == .compact ? .infinity : 480)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(T.color.bg.canvas)
    .irNode("root")
  }

  @Environment(\.horizontalSizeClass) private var sizeClass
}

#Preview { LoginLayout(subtitle: "Connectez-vous pour continuer") }
```

Deux points à retenir sur cette sortie :
- `mainAlign: center` sur un Stack `fill` devient une paire de `Spacer`. Un Stack `hug` n'en génère pas, puisqu'il n'a pas d'espace libre.
- `crossAlign: stretch` n'a pas de traduction directe en SwiftUI ; il est compilé en `.frame(maxWidth: .infinity)` sur chaque enfant `hug` concerné. C'est un cas où la décompilation doit reconnaître un motif (tous les enfants portent le même modificateur) pour retrouver la propriété du parent. §11.2 liste ces motifs.

---

## 11. Tables de correspondance

### 11.1 IR → CSS

Cible React + CSS Modules (ADR-009). Chaque nœud a une classe nommée par son `#id` dans `X.gen.module.css`, et un élément portant `className={s.id}` et `data-ir="id"` dans `X.gen.tsx`. Les déclarations sont émises une par ligne, dans l'ordre de cette table ; c'est ce qui rend la décompilation un parsing de forme.

| IR | CSS |
|---|---|
| `Stack(dir: v)` | `display: flex; flex-direction: column` |
| `Stack(dir: h)` | `display: flex; flex-direction: row` |
| `w: fixed(n)` | `width: n px` ou `var(--size-x)`, plus `flex-shrink: 0` si l'axe est l'axe principal du parent |
| `w: hug` (main) | `flex: 0 0 auto` |
| `w: hug` (cross) | rien : `align-items` du parent, toujours émis, s'applique |
| `w: hug` sur un `Stack(dir: h)` non étiré | `width: max-content` : la taille d'un Stack sur son axe principal est celle de son contenu, que l'espace disponible ne rabote pas (§5.2) ; sans elle, CSS rétrécirait |
| `w: fill` (main) | `flex: 1 1 0; min-width: 0` (`min-height: 0` en colonne) ; si `minW` (`minH`) est présent, sa déclaration remplace ce `0` |
| `w: fill` (cross) | `align-self: stretch` |
| `w`, `h` de la racine | `width` / `height` : `100%` (fill), `max-content` (hug, le contenu décide, §5.2), `n px` (fixed), toujours émis |
| `minW`, `maxW`, ... | `min-width`, `max-width`, ... |
| `gap: $t` | `gap: var(--t)` |
| `pad: ...` | `padding: ...`, une, deux ou quatre valeurs |
| `mainAlign` | `justify-content: center / flex-end / space-between`, omis pour `start` |
| `crossAlign` | `align-items: flex-start / center / flex-end / stretch`, toujours émis (le défaut CSS est `stretch`) |
| `overflow: clip` | `overflow: hidden` |
| `overflow: scroll` | `overflow-y: auto` (v) / `overflow-x: auto` (h) |
| `bg`, `radius`, `border`, `shadow`, `opacity` | `background`, `border-radius`, `outline: w solid color` plus `outline-offset: calc(-1 * w)` (bordure décorative, ADR-010), `box-shadow`, `opacity`, valeurs via variables CSS |
| `Text.style: $type.x` | `font-family`, `font-size`, `line-height`, `font-weight`, `letter-spacing`, chacune `var(--type-x-<propriété>)` : un token de typographie donne une variable par champ, seule forme qui fonctionne aussi dans un `@media`. Les classes utilitaires de `tokens.css` restent pour le code écrit à la main |
| `Text.color` | `color` |
| `Text.align` | `text-align: center / end`, omis pour `start` |
| `Text`, toujours | `white-space: pre-wrap` : les espaces et les sauts de ligne d'un littéral comptent dans la mesure de référence (§5.3) |
| `Text.maxLines: n` (`truncate: end`) | `display: -webkit-box; -webkit-line-clamp: n; -webkit-box-orient: vertical; overflow: hidden` |
| `Text.maxLines: n, truncate: none`, hauteur `hug` | `overflow: hidden; max-height: calc(n * Lem)`, L étant le `lineHeight` du token ; avec `maxH`, `max-height: min(maxH, calc(n * Lem))` porte les deux |
| `Text.maxLines: n, truncate: none`, hauteur définie | le line-clamp de `end`, plus `--ir-truncate: none` : une hauteur maximale changerait une boîte que `fixed` ou `fill` fixe déjà. Le navigateur dessine alors l'ellipse du line-clamp — seule infidélité de rendu de cette table, la géométrie reste exacte |
| `Image.fit: contain` | `object-fit: contain`, omis pour `cover` |
| `Image.ratio: (w, h)` | `aspect-ratio: w / h` |
| `Icon` | `<Icon name="nom web" />` (ADR-005) ; `width` et `height: var(--size-x)`, `color: var(--color-x)`, `flex-shrink: 0` |
| élément d'un `Text` | `<hn>` si `role: heading(n)`, `<span>` sous un parent `role: button`, `<p>` sinon |
| élément d'un `Stack` ou d'une `Box` | `<div>` ; d'une `Image` : `<img>` |
| `role: button` | `role="button"` (ou `<button>` quand la couche composants existera) |
| `role: textfield` | `role="textbox"` |
| `role: list`, `listitem`, `image` | `role="list"`, `role="listitem"`, `role="img"` |
| `role: decorative` | `aria-hidden="true"` |
| `role: heading(n)` sur un nœud autre qu'un `Text` | `role="heading" aria-level="n"` |
| `label` | `aria-label` ; sur une `Image`, `alt` (`alt=""` sans label) |
| contenu littéral | texte JSX, ou `{"…"}` s'il contient `{`, `}`, `<`, `>`, `&`, un retour à la ligne ou un espace en bord |
| `slot(nom)` | `{nom}` sur un `Text` ; `src={nom.src} alt={nom.alt ?? "…"}` sur une `Image`, le repli étant le `label` du nœud (`""` sans label) ; paramètre du composant |
| `@expanded(...)` | `@media (min-width: 600px) { .id { ... } }` après la règle du nœud : d'abord `revert` pour les déclarations qui disparaissent, puis celles qui changent (un `revert` de raccourci placé après un longhand l'annulerait) |

Le seuil 600 est lu dans le design system (`$bp.expanded`), jamais codé en dur dans le compilateur. Le compilateur normalise son entrée (§7, loi 4) et n'émet jamais deux fois la même propriété dans une règle : la règle d'un nœud est une fonction de ses propriétés résolues, et la décompilation (§9.1) la lit comme un dictionnaire.

### 11.2 IR → SwiftUI

Sous-ensemble de SwiftUI autorisé dans la zone générée : `VStack`, `HStack`, `AnyLayout` avec `VStackLayout` et `HStackLayout` (uniquement pour un `dir` surchargé), `Spacer`, `Text`, `Image`, `RoundedRectangle`, `ScrollView`, et les modificateurs `.frame`, `.padding`, `.background`, `.overlay`, `.clipped`, `.clipShape`, `.opacity`, `.shadow`, `.font`, `.foregroundStyle`, `.lineLimit`, `.multilineTextAlignment`, `.aspectRatio`, `.accessibilityLabel`, `.accessibilityAddTraits`, `.irNode`. Rien d'autre. La décompilation est un parsing de ce sous-ensemble.

| IR | SwiftUI |
|---|---|
| `Stack(dir: v)` | `VStack(alignment:, spacing:)` |
| `Stack(dir: h)` | `HStack(alignment:, spacing:)` |
| `gap` | `spacing:` |
| `pad` | `.padding(...)` |
| `w: fixed(n)` | `.frame(width: n)` |
| `w: hug` | défaut (aucun modificateur) |
| `w: fill` | `.frame(maxWidth: .infinity)` |
| `minW`, `maxW` | `.frame(minWidth:, maxWidth:)` |
| `mainAlign: start` (Stack fill) | `Spacer(minLength: 0)` en fin |
| `mainAlign: end` (Stack fill) | `Spacer(minLength: 0)` en début |
| `mainAlign: center` (Stack fill) | `Spacer` en début et en fin |
| `mainAlign: between` (Stack fill) | `Spacer` entre chaque paire d'enfants |
| `mainAlign` (Stack hug) | rien |
| `crossAlign: start/center/end` | `alignment: .leading/.center/.trailing` (V) ou `.top/.center/.bottom` (H) |
| `crossAlign: stretch` | `.frame(maxWidth: .infinity)` (V) ou `maxHeight` (H) sur chaque enfant `hug` |
| `overflow: clip` | `.clipped()` |
| `overflow: scroll` | envelopper dans `ScrollView(.vertical / .horizontal)` |
| `bg` | `.background(color, in: shape)` |
| `radius` | `RoundedRectangle(cornerRadius:)` comme shape de background ou `.clipShape` |
| `border` | `.overlay(shape.stroke(color, lineWidth:))` |
| `Text.maxLines` | `.lineLimit(n)` |
| `Text.align` | `.multilineTextAlignment` |
| `Image.fit` | `.aspectRatio(contentMode: .fill / .fit)` |
| `role: heading` | `.accessibilityAddTraits(.isHeader)` |
| `role: button` | `.accessibilityAddTraits(.isButton)` |
| `role: decorative` | `.accessibilityHidden(true)` |
| `@expanded(...)` | `@Environment(\.horizontalSizeClass)` et expressions conditionnelles dans les modificateurs |
| `@expanded(dir: ...)` | `AnyLayout(sizeClass == .compact ? AnyLayout(VStackLayout(...)) : AnyLayout(HStackLayout(...))) { ... }` : `dir` est surchargeable comme toute propriété de layout (§4.7), et c'est la seule construction qui change de conteneur sans dupliquer les enfants |

Motifs que la décompilation doit reconnaître (parce que la propriété du parent est éclatée sur les enfants ou en Spacers) :
- N enfants portant tous `.frame(maxWidth: .infinity)` sous un `VStack` → `crossAlign: stretch` sur le parent.
- Spacers en tête / queue / entre → `mainAlign`.
- `sizeClass == .compact ? a : b` dans un modificateur → surcharge `@expanded`.
- `AnyLayout(sizeClass == .compact ? … VStackLayout … : … HStackLayout …)` → surcharge `@expanded(dir: …)`.

Approximation assumée (documentée dans le papier) : la size class SwiftUI n'est pas strictement un seuil de largeur. Sur iPhone en portrait elle est toujours `compact` ; sur iPad elle dépend du multitâche. C'est acceptable en v0 parce que le design system ne définit que deux breakpoints. Si un troisième breakpoint apparaît, le backend SwiftUI devra passer à un seuil de largeur explicite via `GeometryReader`.

### 11.3 Figma auto-layout → IR

| Figma | IR |
|---|---|
| Frame avec auto-layout vertical / horizontal | `Stack(dir: v / h)` |
| Item spacing | `gap` (résolu vers le token le plus proche ; erreur E001 si aucun token ne correspond exactement, sauf en mode tolérant) |
| Padding | `pad` (idem) |
| Fixed width | `w: fixed(n)` |
| Hug contents | `w: hug` |
| Fill container | `w: fill` |
| Min / max width | `minW` / `maxW` |
| Primary axis alignment | `mainAlign` (`space between` → `between`) |
| Counter axis alignment | `crossAlign` |
| Clip content | `overflow: clip` |
| Fill (solid, lié à une variable) | `bg: $color.*` |
| Corner radius (variable) | `radius` |
| Stroke (variable) | `border` |
| Text node avec style | `Text(style: $type.*)` |
| Text « Truncate text » + max lines | `maxLines`, `truncate: end` |
| Frame avec image fill | `Image(fit: cover / contain)` |
| Instance de composant icône | `Icon` (si le composant appartient au jeu d'icônes déclaré) |
| Frame nommée `slot:nom` contenant un texte | `Text(...) slot(nom)` |
| Deux frames nommées `Login/compact` et `Login/expanded` | un écran avec surcharges `@expanded`, si et seulement si les arbres sont structurellement identiques (E008 sinon) |

Rejets explicites (erreur E003 avec chemin du calque) : frame sans auto-layout contenant plus d'un enfant, position absolue, rotation, wrap, grid, effets non tokenisés, couleurs non liées à une variable, groupes, masques, booléens de formes.

Le mode tolérant (`--tolerant`) arrondit les valeurs numériques au token le plus proche et émet W002 ; il sert à l'exploration d'un fichier existant, jamais à la génération de fichiers `.ir` commités.

---

## 12. Erreurs et avertissements

| Code | Type | Message | Où |
|---|---|---|---|
| E001 | erreur | Valeur littérale là où un token est requis | parse, import |
| E002 | erreur | Token, icône ou breakpoint inconnu dans le design system, token non référençable, ou type DTCG inattendu pour le groupe | typecheck, compile, decompile |
| E003 | erreur | Construction non représentable dans l'IR | import, decompile |
| E004 | erreur | Propriété invalide pour ce type de nœud, ou nom de slot invalide (§9.3) | parse, compile |
| E005 | erreur | Identifiant dupliqué | parse, decompile |
| E006 | erreur | Image sans dimension résolvable | typecheck |
| E007 | erreur | `fill` sous une contrainte infinie : enfant `fill` sur l'axe de défilement d'un Stack `scroll` (ADR-008), ou `fill` sans viewport | typecheck, layout |
| E008 | erreur | Frames de breakpoints structurellement différentes | import |
| E009 | erreur | Erreur de syntaxe (lexème inattendu, fin de fichier prématurée, type de nœud inconnu) | parse |
| E010 | erreur | Design system invalide (fichier mal formé, alias vers un token inexistant, alias cyclique, deux icônes ou deux tokens de même nom pour une cible) | typecheck, compile, decompile |
| W001 | avert. | `fill` dans un parent `hug`, normalisé en `hug` | normalize |
| W002 | avert. | Valeur arrondie au token le plus proche (mode tolérant) | import |
| W003 | avert. | Surcharge sans effet, supprimée | normalize |

Un message d'erreur contient toujours : le code, le chemin du nœud (`root/form/email`), la ligne et la colonne si la source est un `.ir`, le nom du calque si la source est un import, et une phrase qui dit quoi faire.

---

## 13. Questions ouvertes

Chaque question est tranchée par un ADR avant la tâche qu'elle bloque, ou notée ici quand elle ne mérite pas d'ADR. État :

1. **Nom du langage et extension.** `.ir` est un nom de travail. Tranché sans ADR : `.ir` jusqu'au papier.
2. **Syntaxe humaine ou JSON seul.** Tranché par l'ADR-006 : les deux, la syntaxe humaine étant canonique et le JSON dérivé.
3. **Dimensions littérales.** Tranché par l'ADR-004 : littéraux ou `$size.*` pour `fixed`, `min`, `max` ; tokens obligatoires pour `gap`, `pad` et le style.
4. **Cible web.** Tranché par l'ADR-009 : React + CSS Modules, parce que les slots typés sont l'endroit où la frontière design/code devient vérifiable par le compilateur TypeScript.
5. **Icônes.** Tranché par l'ADR-005 : jeu déclaré dans le design system, un nom par backend, E002 si absent.
6. **Scroll et `fill`.** Un enfant `fill` sur l'axe de scroll d'un Stack `scroll` reçoit une contrainte infinie (E007). Alternative : l'interpréter comme `hug`. Défaut : E007, parce que l'erreur révèle presque toujours une intention floue du design. **Ouverte, à trancher avant T6.**
7. **Troisième breakpoint.** Tranché par l'ADR-003 : deux breakpoints en v0, l'extension est notée là.
8. **Identifiants générés.** Tranché par l'ADR-007 : hash du chemin d'indices et du type.

---

## 14. Glossaire

- **Adjonction** : paire de traductions entre deux mondes, lossy dans un sens, avec des lois qui bornent la perte. Ici : IR ↔ design et IR ↔ code.
- **Axe principal / secondaire** : direction d'empilement d'un Stack et sa perpendiculaire.
- **Backend** : compilateur de l'IR vers une cible (CSS, SwiftUI, plus tard Compose).
- **Breakpoint** : classe de largeur de viewport nommée par le design system.
- **Décompilation** : lecture de la zone générée d'un code pour retrouver l'IR.
- **Forme normale** : représentation canonique d'un IR, unique, utilisée pour toute comparaison.
- **Fragment design-relevant** : ce que l'IR gouverne, défini dans ADR-002.
- **Hug / fill / fixed** : les trois modes de dimension par axe.
- **Importeur** : lecture d'un artefact de design (Figma, Penpot, DOM) vers l'IR.
- **Placeholder** : contenu d'exemple fourni par le design, compilé vers les previews.
- **Slot** : contenu fourni par le code, exposé comme paramètre de la zone générée.
- **Token** : valeur nommée du design system, référencée par `$groupe.nom`.
- **Zone générée / préservée** : les deux parties du code produit, l'une réécrite à chaque compilation, l'autre jamais.
