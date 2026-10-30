<!-- doc/integration/timeline-ha2-api.md -->
# HA2 : commandes par propriété et transactions

Contrat cible : HA-TL-001 r2. Branche : `v2/HA2-property-editing-api`, issue de
`1b0232bad4d5b259b5d836d2853649c64b5636cd`. État : implémentation et vérifications
locales complètes réussies le 30 octobre 2026, revues ECC favorables, sans version
publiée. Ce document complète `timeline-ha1-api.md`.

## Frontière publique

`createEditor()` retourne maintenant `editor.propertyTimelines`, une façade
disponible même avec `defaultPlugins: false` et une scène d'objets génériques.
Chaque méthode de modification retourne `PropertyTimelineMutationResult` :
`{ status: 'changed' }`, `{ status: 'noop' }`, ou
`{ status: 'refused', reason: string }`. Les raisons de refus sont en français.
Un refus métier ne crée aucune entrée d'historique.

Les valeurs sont des `TimelinePropertyValue` du runtime : nombre, texte, booléen
ou couleur RGBA. Le premier enregistrement d'une propriété exige `initialValue`,
fourni par l'hôte. Cette valeur ne provient jamais d'une lecture du DOM animé.
Une fois enregistrée, la base ne peut pas être remplacée par une édition de clé.

| Méthode | Effet |
| --- | --- |
| `set(layerId, property, value, { frame?, initialValue? })` | Crée ou modifie une clé de cette seule propriété. |
| `capture(layerId, property, { frame?, initialValue? })` | Insère une clé avec la valeur réellement évaluée à cette image. |
| `deleteKey(layerId, property, frame?)` | Retire une clé ; la dernière clé retire la piste. |
| `moveKey(layerId, property, frame, toFrame)` | Déplace une clé sans croiser ni remplacer ses voisines. |
| `createTransition(layerId, property, frames, easing?)` | Relie exactement deux clés consécutives d'une propriété interpolable. |
| `removeTransition(layerId, property, transitionId)` | Retire seulement cette interpolation ; les clés restent. |
| `setEasing(layerId, property, transitionId, easing?)` | Change l'effet de cette transition ; absence d'effet = linéaire. |
| `migrate(layerId, property)` | Convertit explicitement une piste numérique historique, ou refuse si sa fidélité n'est pas garantie. |
| `beginTransaction(label)` | Commence un geste annulable commun à plusieurs propriétés. |

Les images sont des entiers entre 1 et `totalFrames`. Lorsque `frame` est omis,
la position courante est capturée une seule fois à l'appel. L'échantillonnage
`editor.sample(frame)` accepte toujours des images fractionnaires.

Les verrouillages du calque et de ses parents, les propriétés autorisées par la
scène, les types, les images et les conflits avec l'ancien modèle sont contrôlés.
Une liste de capacités explicitement vide interdit toute propriété. Sans liste
restrictive, les propriétés typées ne nécessitent pas un descripteur numérique.
Les capacités sont relues lors de l'exécution et du rétablissement.

## Capture, courbes et modifications

Sans MotionTween, une clé maintient sa valeur jusqu'à la suivante. Aucune clé
initiale implicite n'est ajoutée. Créer une clé explicite est une modification
même si sa valeur égale déjà la valeur courante ; répéter une clé identique est
un `noop`.

Insérer une clé à l'intérieur d'une interpolation capture la valeur évaluée et
crée deux transitions. Leur source conserve le domaine, les clés et l'effet
d'origine : la courbe entière reste identique, y compris aux images fractionnaires
et en présence de dépassement. Une deuxième insertion conserve la même source.

Modifier ensuite la valeur de la clé détache la source des transitions incidentes,
qui sont recalculées entre leurs nouvelles extrémités. Déplacer une clé détache
également ces sources. Changer l'effet détache uniquement la source de la
transition concernée. Supprimer une clé reliée à un MotionTween est refusé : il
faut retirer explicitement ses transitions avant de supprimer la clé.

`PropertyEasing` accepte les familles et modes décrits dans le document HA1,
leurs paramètres et les courbes de Bézier. Texte et booléen restent discrets ;
demander leur interpolation est refusé. Les nombres et couleurs sont interpolables.

## Gestes et événements

`beginTransaction()` retourne un `IPropertyTimelineTransaction` avec `active`,
`commit()` et `cancel()`. Les modifications intermédiaires sont visibles. `commit`
enregistre une seule entrée d'annulation ; `cancel` restaure le document antérieur
sans perdre les entrées de rétablissement qui existaient avant le geste. Un geste
X/Y utilise donc deux éditions indépendantes dans une transaction commune.
Le Designer doit relier Échap à `cancel()`.

Les groupes imbriqués sont refusés. `load()` et `destroy()` invalident les poignées
en cours ; une poignée périmée ne peut ni terminer ni annuler un nouveau geste.
Après destruction, les méthodes capturées de la façade deviennent indisponibles.

`editor.on('property:changed', listener)` reçoit un `PropertyChangedEvent` pour
chaque piste effectivement modifiée par une commande, une annulation, un
rétablissement ou une annulation de geste. Les champs `before` et `after`
contiennent les pistes exactes ; ils sont absents lors de création/suppression.
L'événement inclut `layerId`, `property`, `cause`, `label` et `kind`.

Lorsqu'une seule clé change, `frame`, `oldValue` et `newValue` décrivent les valeurs
évaluées avant/après à cette image. Les changements structurels, déplacements et
migrations ne prétendent pas correspondre à un changement ponctuel : leurs pistes
complètes font foi. `transactionId` identifie les événements d'un geste actif et
de son annulation ; il ne constitue pas un identifiant persistant du document.
Ni déplacement de tête de lecture, ni échantillonnage, ni chargement n'émettent cet
événement. Les plugins peuvent l'écouter, mais ne peuvent pas le fabriquer.
Les notifications suivent l'ordre des commits, après les notifications du document.
Une modification déclenchée par un callback est livrée après toutes les propriétés
du commit précédent. Un chargement purge les notifications encore en attente.

## Migration et compatibilité

L'ancien `editor.setProperty()` conserve son contrat numérique historique. Il ne
migre pas silencieusement les plages. Les commandes historiques de plages,
d'interpolation et de presse-papiers refusent les calques possédant des pistes
modernes, jusqu'à l'adaptation de l'interface en HA3. Les autres calques historiques
restent utilisables. Un dictionnaire moderne vide n'active pas ce refus.

La migration conserve les plages pour la visibilité et les autres propriétés.
Elle accepte les maintiens statiques représentables et une interpolation isolée
avec extrémités explicites. Les historiques combinant plusieurs plages de contenu
avec interpolation, les extrémités absentes, certaines bornes ou interpolations
personnalisées incompatibles sont refusés au lieu d'être approximés.

Une source migrée peut contenir `legacyEasing`, mutuellement exclusif de
`source.easing`. Elle utilise l'évaluation numérique historique dans son domaine
absolu, afin de préserver aussi son ordre d'opérations arithmétiques. Ce détail
est sérialisé dans le schéma JSON et conservé par les modèles .NET générés.

## Limites de livraison

Cette façade prépare le raccordement du Designer. HA3 doit encore fournir les
lignes et commandes visuelles par propriété ainsi que le dialogue d'effets.
HA4 doit fournir l'adaptateur HTML riche, les bases DOM, groupes, spécificités et
conflits ; les scènes HTML refusent encore les pistes modernes. HA5/HA6 couvrent
les exports de lecture, JavaScript autonome et CSS fidèle. Aucune de ces limites
ne doit être masquée par un second moteur temporel dans HtmlAnimation.

La démo API permanente est `demo/editor/property-timelines.html` ; les scénarios
Playwright associés restent dans le dépôt. La démo de courbes du socle HA1 demeure
`demo/runtime/fixtures/property-timelines.html`.

Vérifications locales : 3 519 tests JavaScript, 167 tests Playwright éditeur/runtime,
9 tests Playwright Blazor et 180 tests .NET réussis ; build Release sans avertissement,
lint/typecheck/builds et consommateurs des packages locaux réussis. Les quatre revues
ECC (générale, TypeScript, C# et sécurité) ne laissent aucun constat bloquant.
