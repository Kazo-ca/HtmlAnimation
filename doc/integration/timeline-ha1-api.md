<!-- doc/integration/timeline-ha1-api.md -->
# Socle HA1 : API disponible et limites

Référence de travail : `v2/HA1-property-tracks`, vérifications locales et revues ECC
réussies le 30 octobre 2026. Contrat cible : HA-TL-001 r2. Ce document ne déclare pas le contrat
complet livré et ne désigne pas une version publiée.

Livraison du socle : [PR #122](https://github.com/Kazo-ca/JsAnimationTimeline/pull/122),
fusionnée uniquement dans `v2/base` au commit
`1b0232bad4d5b259b5d836d2853649c64b5636cd`. Le commit fonctionnel vérifié est
`7bf82252ee89482a5a5d2cc300e71a63697cfab1`.

## Modèle et évaluation

`ILayer.propertyTimelines` est un dictionnaire optionnel de pistes indépendantes.
Chaque piste contient `initialValue`, `keys` et, facultativement, `transitions`,
`beforeFirst`, `label` et `group`. Les clés sont triées, numérotées de 1 à N.
Une transition relie deux clés consécutives de la même propriété.

`TimelinePropertyValue` distingue `number`, `text`, `boolean` et `color`.
Une couleur contient les canaux `r`, `g`, `b`, `a` entre 0 et 1. Une piste garde
le même type de valeur. Nombres et couleurs permettent une interpolation ; textes
et booléens sont des changements maintenus, sans MotionTween.

Les fonctions publiques `evaluatePropertyTimeline`, `evaluatePropertyTimelines`,
`evaluateLayer` et `evaluateDocument` évaluent les images entières ou fractionnaires.
Avant la première clé, la valeur initiale s'applique par défaut. `beforeFirst:
'first-key'` est une capacité explicite destinée aux règles de recouvrement de
l'intégration ; elle ne détecte ni ne résout elle-même le cas groupe/ID.

Une transition peut garder une `source` contenant le domaine, les clés et l'effet
de la courbe originale. Ce socle permet une découpe fidèle ; la commande qui réalise
l'insertion et crée les deux transitions appartient au lot HA2.

Les sorties de calques modernes exposent `propertyValues`, le dictionnaire typé.
`values` demeure la projection numérique de compatibilité. Les documents historiques
gardent leur forme de sortie sans champ supplémentaire. Une même propriété ne peut
pas apparaître simultanément dans les anciennes plages et les nouvelles pistes.

## Accélérations

`PropertyEasing` décrit soit une Bézier, soit une famille d'effets, un mode et ses
paramètres. `isPropertyEasing` valide la description et
`createPropertyEasingFunction` fournit son évaluation. La progression d'entrée est
bornée à 0–1 ; les dépassements de sortie sont conservés. Les bornes des propriétés
numériques restent appliquées par leur descripteur.

La démo `demo/runtime/fixtures/property-timelines.html` utilise le vrai lecteur et
une scène d'objets dessinée sur canvas. Elle présente les familles, paramètres et
courbes, les pistes indépendantes et leurs valeurs typées. Elle configure un exemple
de lecture ; elle ne remplace pas le futur dialogue de l'éditeur.

## Consommateurs

Les scènes génériques reçoivent `IStageLayerState.propertyValues` ; une scène
`createObjectStage` transmet ce même état à `apply` et `endFrame`. Les valeurs
initiales typées servent à la restauration des propriétés relâchées.

Les échantillons `editor.sample()` et `onFrame()` exposent `propertyValues`, avec
dictionnaire et valeurs copiés et figés. Aucun événement d'édition ni aucune clé
n'est créé par l'échantillonnage.

Le modèle C# est généré à partir du schéma JSON. `TimelineStageLayerState` ajoute
`PropertyValues` facultatif ; `Values` garde son dictionnaire numérique. Le bridge
JavaScript transmet les données typées sans les convertir en nombres.

## Capacités encore attendues

- HA2 : commandes, migration des pistes historiques, capture/insertion/découpe,
  transactions et annulation des gestes.
- HA3 : lignes par propriété, sélection, dépliage et dialogue d'effets dans l'éditeur.
- HA4 : adaptateur HTML riche, groupes, valeurs initiales DOM et conflits/priorités.
- HA5/HA6 : formats de lecture, JS autonome et CSS fidèle.

À ce stade, les scènes HTML refusent explicitement un calque contenant des pistes
modernes ; l'export CSS refuse globalement ces documents. Cela évite une sortie
partielle trompeuse pendant le développement des adaptateurs. Les anciens documents
conservent leur lecture HTML et leur export. La sauvegarde du nouveau modèle et
les scènes génériques fonctionnent indépendamment de cette restriction transitoire.

Le Designer peut continuer avec son adaptateur et ses simulations identifiées.
Il ne doit pas considérer cette livraison du socle comme le raccordement final.
