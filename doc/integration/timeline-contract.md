<!-- doc/integration/timeline-contract.md -->
# Contrat cible de JsAnimationTimeline pour HtmlAnimation

| Métadonnée | Valeur |
| --- | --- |
| Identifiant | HA-TL-001 |
| Révision documentaire | 2 — 30 octobre 2026 |
| Statut | Exigences futures ; intégration non livrée et conformité non vérifiée. |
| Responsable du contrat Timeline | Chantier JsAnimationTimeline. |
| Consommateur | `Kazo-ca/HtmlAnimation` : Designer, panneau CSS, HierarchicalDomTree. |
| Référence de l'état actuel inspecté | `v2/base`, commit `e90be9d5338b81ad644455c89ca64d22c526eb09`. |
| Version npm qui satisfait tout ce contrat | Non identifiée ; ne pas supposer que la version publiée le satisfait. |

Ce document est autonome : aucune lecture d'une autre session ou d'un dossier
voisin n'est nécessaire. Les [spécifications du Designer](specifications-designer.md)
décrivent le produit consommateur. Ce contrat décrit ce que la Timeline et son
intégration devront permettre après leurs évolutions.

Les garanties fonctionnelles viennent des décisions utilisateur. Les tableaux
d'opérations sont des besoins de contrat, **pas des signatures TypeScript déjà
publiées**. Leur correspondance avec une API exacte sera précisée par le chantier
Timeline avant le raccordement réel. Une simulation ne prouve pas la conformité
du package actuel.

## 1. Frontière de responsabilité

| JsAnimationTimeline | HtmlAnimation et son intégration HTML |
| --- | --- |
| Objets temporels génériques, propriétés, clés, transitions, easing, évaluation, lecture. | DOM, valeurs CSS effectives, choix des sélecteurs, correspondances multiples et spécificité. |
| Commandes temporelles, validation des transitions, annulation des mutations de clés. | Panneaux, arbre, poignées, guides et coordination d'un geste utilisateur. |
| Capacités de propriétés et diagnostics exploitables par un client. | Compatibilité des valeurs entre éléments d'un groupe, présentation des diagnostics. |
| Valeurs initiales fournies par l'hôte et application des règles temporelles enregistrées. | Inspection des valeurs initiales HTML hors aperçu ; décisions de ciblage et de conflit. |
| Données temporelles éditables et données nécessaires à la lecture/export. | Projet Designer, changements persistants d'ID/classes et Full XPath. |

Les exporteurs et adaptateurs HTML peuvent appartenir à des packages de l'écosystème
Timeline sans introduire de dépendance DOM dans son noyau générique. La Timeline
doit rester utilisable pour des objets simples, du canvas ou de l'audio.

Le Designer ne compense pas une API manquante en réimplémentant l'interpolation,
le maintien, la découpe des tweens ou l'historique temporel. Un adaptateur de frontière
traduit les échanges ; les simulations restent des supports de tests/démos.

## 2. Modèle conceptuel à exposer

Les identifiants et structures ci-dessous expriment l'information nécessaire,
sans imposer de format de stockage ou de noms de champs publics.

| Notion | Information nécessaire |
| --- | --- |
| Document temporel | Cadence, durée, objets et propriétés ; images numérotées de 1 à N. |
| Objet | Identité stable, nom affiché, cible ou référence d'hôte. Renommer le sélecteur ne doit pas perdre les clés. |
| Propriété | Identité, valeur, capacités d'édition et d'interpolation, métadonnées utiles au contrôle. |
| Clé | Objet, propriété, numéro d'image et valeur capturée/enregistrée. |
| Transition | Deux clés d'une même propriété, période et easing propres. |
| État évalué | Image et valeurs des propriétés pour chaque objet concerné. |
| Sélection | Objet(s), propriété éventuelle et clés sélectionnées ; distincte des données de lecture. |
| Diagnostic | Motif, gravité bloquante ou avertissement, objet/propriété/période concernés et correction possible. |

Les propriétés doivent pouvoir représenter les valeurs nécessaires aux couleurs
et dégradés. Leur représentation sera définie techniquement ; la seule présence
actuelle de valeurs numériques n'est pas une garantie de couverture CSS complète.
Les points d'un dégradé doivent conserver leur identité lorsque d'autres points
sont ajoutés ou retirés.

Une cible générique ne doit pas être obligée de fournir un sélecteur, un élément
DOM ou un XPath. Les objets `.button` et `#button-2` restent distincts, même si
l'intégration HTML résout une partie de leurs cibles vers le même élément.

## 3. Opérations attendues à la frontière d'intégration

Cette liste permet au chantier Designer de concevoir ses composants et son adaptateur.
Le chantier Timeline devra fournir une correspondance vers des méthodes/services
réels, avec leurs types, avant de déclarer l'intégration disponible.

| Besoin | Entrées conceptuelles | Résultat et garanties attendus |
| --- | --- | --- |
| Lire le contexte temporel | Instance Timeline. | Image courante, cadence, durée et état de lecture ; pas de mutation. |
| Évaluer une image | Image, objets/propriétés si nécessaire. | Valeurs cohérentes sans créer de clé ni émettre une édition utilisateur. |
| Fournir l'état initial | Cible et valeurs initiales obtenues par l'hôte. | Base propre à la cible ; pas de lecture DOM imposée au noyau. |
| Écrire une propriété | Objet, propriété, valeur, image. | Création ou modification de cette seule clé à l'image demandée. |
| Insérer une clé sans changement | Objet, propriété, image. | Capture de la valeur évaluée et, dans un tween, séparation conforme à la section 4. |
| Créer/modifier/supprimer une transition | Deux clés d'une même propriété, réglages. | Transition indépendante et validation des valeurs/capacités. |
| Observer/mettre à jour la sélection | Identités d'objets, propriétés et clés. | Synchronisation des vues sans création d'objet ni modification de l'animation. |
| Regrouper un geste | Ensemble de modifications de propriétés. | Une entrée d'historique pour le geste ; possibilité de valider ou d'annuler le geste. |
| Annuler/rétablir | Historique partagé par l'intégration. | Restauration cohérente des valeurs, clés et aperçu. |
| Sauvegarder/recharger le document éditable | Document temporel et contexte d'intégration. | Conservation des clés et transitions originales ; aucune conversion implicite en images préévaluées. |
| Produire des données de lecture | Document, format demandé et capacités. | Résultat fidèle ou diagnostic explicite ; règles de la section 7. |

Une mutation doit permettre de distinguer une modification, une absence d'effet
et un refus avec motif. Une nouvelle clé explicite constitue une modification
même si sa valeur égale la valeur évaluée ; une simple consultation ne le fait pas.

L'adaptateur doit utiliser les commandes/API publiques, pas modifier les données
internes ou charger le document complet à chaque mouvement pour simuler une édition.
Le remplacement de document et une édition annulable sont des opérations distinctes.

## 4. Garanties temporelles

### Clés indépendantes

Une modification à l'image courante crée la clé de la propriété si elle manque,
ou met à jour cette clé. Elle ne crée ni ne déplace les clés des autres propriétés.
Modifier une position à 50 laisse intact un tween d'opacité de 1 à 100.

Créer une clé sans changement capture la valeur évaluée à cette image, interpolation
comprise. La clé n'est ni un reset vers la base, ni un masquage, ni une instruction
valable une seule image. Sans tween, sa valeur se maintient jusqu'à la clé suivante,
puis la dernière valeur se maintient jusqu'à la fin.

Avant la première clé d'une cible sans recouvrement, l'état d'origine reste applicable.
Aucune clé initiale n'est créée automatiquement. Le cas spécifique de la section 6
constitue une exception explicitement décidée, sans généralisation aux objets génériques.

### Transitions

La commande MotionTween exige exactement deux clés d'une seule propriété. Zéro,
une, plus de deux clés ou plusieurs lignes rendent la commande indisponible.

Une transition est refusée si les valeurs/capacités sont incompatibles ; le diagnostic
explique la propriété et la période concernées. Les avertissements non bloquants
n'empêchent pas une transition valide.

Modifier une clé de manière à invalider un tween existant est refusé avec explication.
La transition n'est pas supprimée silencieusement. L'utilisateur peut d'abord
adapter ou supprimer le tween.

L'insertion à 50 dans un tween 1–100 capture la valeur évaluée à 50 et crée deux
transitions indépendantes 1–50 et 50–100. L'insertion seule conserve exactement
le mouvement initial, y compris avec un easing non linéaire. Chaque transition
peut ensuite être modifiée ou supprimée indépendamment.

### Effets d'accélération par transition

Chaque MotionTween offre un choix de courbe inspiré de Microsoft Expression Blend :
linéaire, sinus, circulaire, quadratique, cubique, quartique, quintique, puissance,
exponentielle, retour, rebond et élastique. Les modes entrée, sortie et entrée/sortie
s'appliquent à la transition sélectionnée, sans modifier les autres propriétés.
Les courbes de Bézier personnalisées restent disponibles.

Le contrôle affiche la courbe et les paramètres pertinents : puissance, exposant,
amplitude, nombre/intensité des rebonds, nombre d'oscillations et raideur du ressort.
Les valeurs autorisées sont bornées et validées. Les effets peuvent dépasser leurs
valeurs de départ/arrivée ; les contraintes propres à la propriété restent applicables
(par exemple, opacité entre 0 et 1). Aucun code exécutable n'est enregistré dans le JSON.

Changer l'effet ou ses paramètres est annulable ; fermer/annuler le dialogue ne laisse
aucun changement. La sauvegarde conserve l'effet, son mode et ses paramètres.
L'évaluation, la découpe exacte et les exports utilisent ces mêmes données. Un export
CSS incapable de reproduire l'effet fidèlement doit être refusé avec explication.

### Pistes et historique

La Timeline expose une ligne par propriété enregistrée, sans afficher d'emblée
toutes les propriétés non utilisées. Les paramètres de dégradé disposent de
pistes indépendantes regroupées visuellement.

La sélection déplie les propriétés de l'objet ; la désélection restaure le repli
manuel antérieur lorsque l'ouverture venait de la sélection.

Un geste X/Y ou largeur/hauteur écrit des clés distinctes mais constitue une seule
action annulable. Échap annule le geste en cours. La résolution d'un conflit qui
crée une clé est elle aussi explicite et annulable.

## 5. Observations, événements et cycle de vie

L'intégration doit pouvoir observer séparément :

- le changement d'image ou l'image rendue, pour actualiser le panneau et les outils ;
- la sélection, pour synchroniser scène, arbre et Timeline ;
- les modifications du document et leur contexte, y compris annulation/rétablissement ;
- les refus et avertissements, pour donner une explication exploitable.

Une notification de modification identifie l'objet, la propriété et l'image concernés.
Le panneau CSS émet `oldValue` et `newValue`. La correspondance entre ses événements
et ceux de la Timeline devra éviter doubles éditions et boucles de synchronisation.

Naviguer vers une autre image ne crée pas de clé et ne déclenche pas une modification
utilisateur. La restauration d'historique et la sélection ne doivent pas être
rejouées comme une nouvelle saisie du panneau.

L'intégration doit pouvoir se désabonner de ses observations. Une instance Timeline
fournie par l'hôte ne devient pas implicitement la propriété du panneau CSS ou de
l'arbre. La forme des abonnements et la gestion précise des transactions seront
décrites dans la correspondance d'API technique, pas inventées comme existantes ici.

## 6. Spécificité, cas de référence et conflits

L'intégration HTML décide des correspondances et des priorités CSS. Le plus spécifique
gagne pour la propriété concernée : ID devant classe, `.button.primary` devant
`.button`. Les autres propriétés et les autres éléments du groupe sont préservés.

### Cas de référence obligatoire, sans confirmation

Le même bouton possède l'ID `button-2` et la classe `button`. Sans MotionTween :

| Objet | Clés éditables | Résultat sur toute la durée |
| --- | --- | --- |
| `.button` | Opacité 50 % à l'image 1. | 50 % pour les autres boutons. |
| `#button-2` | Une seule clé d'opacité 80 % à l'image 50. | 80 % pour ce bouton, dès l'image 1. |

**Aucune clé à l'image 1 n'est ajoutée à l'objet spécifique et aucun dialogue
de conflit n'est affiché.** Le résultat doit être identique pendant la lecture,
après accès direct à l'image 20 et dans tous les exports acceptés.

L'intégration HTML fournit le contexte ou la règle enregistrée nécessaire à cette
évaluation ; le Designer ne calcule pas lui-même de nouvelles courbes ni n'invente
des clés pour contourner le moteur. La représentation de cette règle dans le contrat
technique reste à convenir sans imposer CSS dans le noyau générique.

Cette exigence porte sur le cas explicitement confirmé. Elle ne remplace pas la
règle avant la première clé pour toutes les cibles sans recouvrement.

### Cas non couverts

Si les règles ne tranchent pas ou si deux règles applicables donnent des résultats
incompatibles, détecter la situation et demander une résolution explicite.
Une spécificité égale avec deux valeurs concurrentes ne doit pas être départagée
par un ordre arbitraire non annoncé.

Le diagnostic indique cibles, propriété, période et effets des choix proposés.
La sélection courante oriente la proposition, mais la décision enregistrée pilote
ensuite lecture et export, indépendamment de la sélection dans l'éditeur.

La solution de départ explicite peut proposer « appliquer cette valeur dès le début »
et créer une clé initiale après validation. Elle n'est utilisée que lorsqu'elle
résout effectivement le conflit ; la clé est annoncée et annulable. Un cas déjà
tranché comme celui ci-dessus n'ouvre pas ce dialogue.

## 7. Sauvegarde et exports attendus

| Sortie | Exigence |
| --- | --- |
| Document éditable | Clés originales, transitions, easing et identités conservés ; complété par les données du Designer et ses décisions. |
| JSON de lecture | Cadence, durée et dictionnaire image → valeurs modifiées par objet ; objets distincts conservés. |
| Images d'un MotionTween dans le JSON | Chaque image couverte est préévaluée avec les valeurs de la transition. |
| JavaScript autonome HTML | Applique uniquement les propriétés de style pilotées aux cibles ; aucune application DOM aux objets génériques. |
| CSS | Même résultat que la lecture ; refus expliqué si la fidélité n'est pas possible, avec alternatives JS/JSON. |

Les noms de champs JSON et signatures d'export ne sont pas encore une API livrée.
Le format de lecture doit permettre de reconstituer directement n'importe quelle
image sans imposer à l'utilisateur de rejouer les précédentes.

Dans le cas de référence, les données de lecture doivent produire 80 % dès le début,
mais cela ne crée aucune clé dans le document éditable. Les objets génériques
transportent des propriétés/valeurs sans concepts CSS, DOM ou XPath obligatoires.

Le ciblage multiple et les priorités doivent être identiques entre aperçu et sorties.
La sauvegarde éditable reste possible si un format d'export ne convient pas.

## 8. État actuel observé et limites à ne pas masquer

Cette matrice décrit le snapshot local cité en tête, pas une nouvelle vérification
des versions publiées. « Présent » ne signifie pas conforme au futur contrat.

| API ou capacité actuelle | Limite pour le futur Designer |
| --- | --- |
| `createEditor`, `sample(frame)`, `onFrame`, `playback`. | Points d'intégration présents ; les règles futures ci-dessus ne sont pas garanties par leur existence. |
| `setProperty(layerId, name, value, { frame })`. | Valeur numérique ; écrit à `span.start` dans des plages statiques ; certains contextes sans contenu sont refusés. |
| Pistes de données par propriété. | `kind` et easing restent liés à une plage commune ; les lignes visuelles par propriété manquent. |
| Insertion F6 dans un tween. | Ajoute des clés sans réaliser la séparation requise ; préservation exacte des courbes non garantie. |
| Sélection de calques/dossiers. | Sélection par propriété, dépliage automatique et restauration restent à fournir. |
| `execute`, `undo`, `redo`, événements de commandes. | Le contrat de regroupement des gestes entre composants reste à établir. |
| `toJSON`, `load`, document natif `ITimelineDocument`. | `load` remplace le document et efface l'historique ; ce n'est pas une édition annulable. |
| Lecteur de document JSON natif. | Ne lit pas directement le dictionnaire préévalué demandé. |
| Stages et cibles génériques. | Pas d'inspection automatique des styles CSS de chaque cible dans le noyau. |
| Export CSS avec avertissements. | Peut ignorer des parties ; ne garantit pas encore le refus global d'une sortie infidèle. |
| Lecteur JavaScript. | Ne constitue pas l'export JavaScript autonome demandé. |
| Ciblage HTML de l'export et du lecteur. | Parité des groupes et priorités à établir ; ne pas présumer que tous les éléments sont traités partout. |
| Cas de référence et nouveaux conflits. | Exigences récentes à auditer et vérifier ; aucun succès de test affirmé. |

Les packages actuels identifiés sont `@kazo-ca/timeline-editor`,
`@kazo-ca/timeline-runtime` et `@kazo-ca/timeline-export-css`. Leur présence dans
le dépôt ou sur un registre ne constitue pas une déclaration de conformité.

## 9. Scénarios communs de conformité

Les deux chantiers pourront utiliser les mêmes cas. Une simulation Designer doit
être identifiée comme telle ; seuls les tests avec une version réelle de Timeline
peuvent attester le raccordement.

| Identifiant | Cas et résultat attendu |
| --- | --- |
| TL-C01 | Éditer une propriété à 50 crée/modifie uniquement sa clé à 50. |
| TL-C02 | Une position à 50 ne touche pas le tween d'opacité 1–100. |
| TL-C03 | Une clé insérée sans changement capture la valeur évaluée ; aucun reset implicite. |
| TL-C04 | Sans tween, la valeur persiste jusqu'à la clé suivante, puis après la dernière. |
| TL-C05 | Sans recouvrement, origine 100 %, première clé à 50 = 80 % : 100 % avant 50 ; aucune clé à 1 ajoutée. |
| TL-C06 | Cas spécifique groupe/ID ci-dessus : 80 % au bouton spécifique dès 1, 50 % aux autres, sans clé supplémentaire ni dialogue. |
| TL-C07 | Insertion dans un tween non linéaire : deux transitions indépendantes, mouvement initial préservé. |
| TL-C08 | MotionTween seulement pour exactement deux clés d'une même propriété ; refus motivé d'une incompatibilité. |
| TL-C09 | Édition invalidant un tween refusée sans destruction de la transition existante. |
| TL-C10 | Geste X/Y : deux propriétés, une seule annulation ; annulation du geste sans changement résiduel. |
| TL-C11 | Navigation/sélection : valeurs affichées actualisées, aucune édition utilisateur ni clé ajoutée. |
| TL-C12 | Sélection/désélection : dépliage temporaire et restauration du repli manuel. |
| TL-C13 | Accès direct à une image, lecture linéaire et exports donnent le même état, sans dépendance à la sélection. |
| TL-C14 | Résolution d'un conflit non couvert : choix explicite, mémorisé, réversible ; A n'ajoute une clé qu'après validation. |
| TL-C15 | JSON générique sans dépendance DOM ; sorties HTML fidèles ou refus CSS expliqué. |
| TL-C16 | Sauvegarde/réouverture conserve les clés et transitions originales ; images exportées non réimportées comme clés d'édition. |
| TL-C17 | Choix d'effet/mode/paramètres sur une transition : courbe et rendu concordants, autres propriétés inchangées, annulation et sauvegarde fidèles. |
| TL-C18 | Insertion dans un effet à dépassement/rebond : mouvement conservé aux images entières et fractionnaires, y compris avec un interpolateur personnalisé. |

## 10. Condition de raccordement réel

Avant de remplacer une simulation par le package réel, le chantier Timeline fournit
la correspondance d'API, la version ou le commit à utiliser, les capacités disponibles,
les cas de conformité exécutés et leurs résultats. Le chantier Designer réalise
alors ses tests d'intégration et Playwright sur cette même référence.

Un écart doit être signalé et conservé dans les documents de coordination. Il ne
devient pas une fonction cachée de l'adaptateur Designer et n'autorise pas une
modification silencieuse des décisions produit. Aucun de ces documents n'autorise
une publication, une fusion vers `main` ou le démarrage d'une implémentation sans
instruction de l'utilisateur.

## Historique des révisions

- Révision 1 : passation autonome des décisions produit jusqu'au cas 59.
- Révision 2 : demande utilisateur du 30 octobre, catalogue d'effets MotionTween
  inspiré de Blend, modes, paramètres, aperçu et scénarios TL-C17/TL-C18.
  Cette révision décrit les exigences ; elle ne déclare pas leur livraison complète.
