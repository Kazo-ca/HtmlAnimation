<!-- doc/integration/specifications-designer.md -->
# Spécifications fonctionnelles du Designer et de ses contrôles réutilisables

Date : 30 octobre 2026.
Référence : HA-DESIGN-001, révision 1. Dépôt produit : `Kazo-ca/HtmlAnimation`.

Ce document consolide les décisions de la discussion jusqu'à la réponse 59.
Il décrit le produit attendu et ses frontières, sans plan d'implémentation,
calendrier, choix de bibliothèques ni code. Les noms des packages restent provisoires.
La dernière précision explicite prévaut sur une recommandation antérieure.

Les évolutions de JsAnimationTimeline sont suivies séparément dans
[le contrat cible de la Timeline](timeline-contract.md). Les comportements
temporels décrits ici constituent des exigences pour cette intégration, pas une
affirmation que la version actuelle les fournit déjà.

## 1. But et périmètre

Fournir une interface de conception visuelle permettant de sélectionner des éléments
HTML existants, d'inspecter leurs styles, de manipuler leur apparence et de composer
leurs changements dans JsAnimationTimeline. Le résultat doit permettre de préparer
un design temporel complet : changements instantanés ou animations interpolées.
Un changement de propriété n'impose donc pas la création d'un MotionTween.

Le contenu HTML est fourni par l'application hôte. Le Designer reçoit :

| Entrée | Rôle |
| --- | --- |
| Conteneur cible | Contient déjà les éléments HTML à inspecter et manipuler. |
| Conteneur du panneau de propriétés | Accueille le contrôle des propriétés CSS. |
| Conteneur de l'arbre DOM | Accueille HierarchicalDomTree. |
| Instance de JsAnimationTimeline | Porte le document temporel, les clés et la lecture. |

La première version couvre JavaScript et TypeScript. L'interface destinée à
l'utilisateur est en français. Les wrappers Blazor et leurs packages NuGet sont
une extension ultérieure.

La création d'un éditeur complet de structure HTML, l'ajout/suppression libre
d'éléments et la réécriture des feuilles de styles sources ne font pas partie de
ce périmètre. Les nouveaux ID/classes nécessaires au ciblage sont, eux, prévus et
tracés explicitement.

## 2. Organisation et responsabilités

Le monorepo `Kazo-ca/HtmlAnimation`, cloné dans
`C:\Users\clefw\repos\source\HtmlAnimation`, contient les trois futurs packages
publiés indépendamment. JsAnimationTimeline conserve son dépôt distinct. Le dossier
documentaire peut être utilisé dans une autre session, sans accès à cette discussion.

| Composant | Responsabilité | Autonomie |
| --- | --- | --- |
| Panneau de propriétés CSS | Présenter les valeurs, les contrôles d'édition et les diagnostics ; signaler les changements. | Réutilisable sans Designer ni Timeline. |
| HierarchicalDomTree | Présenter la hiérarchie du DOM et permettre la sélection des éléments. | Réutilisable sans panneau CSS ni Timeline. |
| Designer | Inspecter le DOM, coordonner sélection et événements, fournir les outils visuels, relier les contrôles à la Timeline et à l'hôte. | Assemble les deux contrôles dans le contexte HTML. |
| JsAnimationTimeline | Gérer clés, pistes, valeurs évaluées, maintien, interpolation, commandes temporelles et lecture. | Reste utilisable avec des cibles non HTML. |
| Application hôte | Fournir le contenu et les conteneurs, conserver le projet et réappliquer les changements persistants du document. | Choisit les sorties et intègre les événements. |

Le panneau CSS et l'arbre ne s'écoutent pas directement pour imposer une intégration
Timeline. Le Designer coordonne leurs événements. Leur utilisation autonome reste
possible dans d'autres applications avec leurs propres règles de sauvegarde.

Le noyau de la Timeline ne reçoit pas de logique spécifique aux sélecteurs CSS,
au XPath, aux poignées HTML ou à l'inspection du DOM. Une application peut utiliser
ses valeurs pour un objet simple, du canvas, de l'audio ou d'autres comportements.
Un moteur de déclenchement ponctuel de scripts/actions n'est pas spécifié ici.

## 3. États et modifications

Trois notions restent distinctes :

- **État d'origine** : propriétés effectives du contenu fourni, hors styles temporaires
  appliqués pour l'aperçu. Il sert à l'inspection et à la comparaison des éléments.
- **Document éditable** : objets ciblés, pistes, clés, transitions et décisions du
  Designer. Une modification du Designer crée ou modifie une clé à l'image courante.
- **Aperçu** : application temporaire des valeurs évaluées aux éléments. L'attribut
  `style` peut être utilisé, sans transformer ces écritures en modifications du CSS source.

Même au début de l'animation, l'utilisateur modifie les valeurs de la première clé,
pas les valeurs de base du document. Il n'existe pas de second mode qui réécrive
silencieusement le CSS source ou décale toutes les clés après un changement de base.

L'hôte coordonne les changements de contenu ou de styles externes pendant l'édition.
Leur prise en compte ne doit pas confondre les valeurs de base avec l'aperçu courant.
Une cible ou une propriété devenue incompatible doit être signalée.

## 4. Sélection et navigation

La scène, HierarchicalDomTree, la Timeline et le panneau de propriétés représentent
une sélection cohérente, coordonnée par le Designer.

Un outil **Sélection** intercepte le clic sur la scène pour sélectionner un élément.
Un mode **Test** permet les interactions normales des liens, boutons et autres
éléments du contenu. La simple inspection ne crée aucun objet dans la Timeline.

Sélectionner un objet Timeline dont le sélecteur représente plusieurs éléments
sélectionne les nœuds correspondants dans l'arbre et surligne tous ces éléments
sur la scène. Le panneau affiche leurs valeurs communes et les incompatibilités.

Dans l'autre sens, sélectionner un nœud privilégie son objet Timeline associé à
l'ID, s'il existe. À défaut, l'unique objet correspondant est sélectionné ; si
plusieurs objets restent possibles, l'utilisateur choisit. Posséder un ID ne crée
pas automatiquement un objet individuel dans la Timeline.

La ligne de l'objet sélectionné se déplie pour montrer ses propriétés. Lors du
changement de sélection, le repli manuel antérieur est restauré si le dépliage
venait de la sélection. Une ouverture manuelle ne doit pas être perdue. La révélation
d'un objet sous des ancêtres repliés doit respecter ce même objectif de conservation
des choix manuels ; son mécanisme appartient à la conception technique.

## 5. Ciblage des objets HTML

Le choix du sélecteur intervient à la première modification enregistrée, pas à la
simple sélection. Il devient le nom visible de l'objet et sa référence de ciblage.

L'utilisateur choisit un ID ou une classe lorsqu'ils sont tous deux disponibles.
S'il choisit les classes, il peut retenir une classe ou une combinaison des classes
présentes. Il peut également attribuer un nouveau nom d'ID ou de classe. Aucun nom
n'est généré à sa place sans son choix.

Plusieurs correspondances sont autorisées avec un avertissement lors de la première
création de l'objet. Le ciblage de l'aperçu et celui des exports doivent représenter
les mêmes éléments. La résolution des cibles relève de l'intégration HTML.

`.button` et `#button-2` constituent deux objets distincts dans le document et le JSON,
même si le second appartient aussi au groupe. Leurs pistes ne sont pas fusionnées.

### Compatibilité des propriétés d'un groupe

Une propriété n'est animable collectivement que si ses valeurs effectives de base
sont identiques pour tous les éléments ciblés. Leur origine peut différer : classe,
style inline, héritage ou autre règle. La comparaison ne se fait pas sur les valeurs
temporaires de l'aperçu.

Si quatre boutons partagent `.button`, mais que l'un possède un `margin-top`
différent, cette propriété est indisponible pour l'animation collective. Cela
n'interdit pas l'animation de leur opacité commune.

La propriété incompatible porte une marque d'information avec une explication au
survol. Le message propose des ID individuels pour la piloter séparément. Le contrôle
ne remplace pas silencieusement les valeurs différentes par une valeur commune.

## 6. Priorités et résolution des conflits

### Règles établies

Le sélecteur le plus spécifique gagne pour la propriété concernée sur les éléments
en commun. Ainsi, `#button-2` est prioritaire sur `.button`, et `.button.primary`
est prioritaire sur `.button`. Les autres propriétés du groupe continuent de
s'appliquer ; les éléments non concernés conservent les valeurs du groupe.

La sélection détermine la cible d'édition et peut orienter une proposition de
résolution. Le résultat enregistré doit pouvoir être relu et exporté sans dépendre
d'une ligne sélectionnée dans l'éditeur.

### Cas de référence confirmé en réponse 59

Le bouton `#button-2` possède aussi la classe `.button`. Sans MotionTween :

| Objet | Clés enregistrées | Résultat attendu |
| --- | --- | --- |
| `.button` | Opacité 50 % à l'image 1. | 50 % pendant toute la durée pour les autres boutons. |
| `#button-2` | Une seule clé d'opacité 80 % à l'image 50. | 80 % pendant toute la durée pour ce bouton, y compris avant 50. |

Ce cas est résolu directement, **sans dialogue et sans ajout de clé à l'image 1**.
La première valeur de l'objet spécifique s'applique aussi avant sa clé dans ce
cas. C'est la portée explicitement confirmée de B ; ce cas ne sert pas à déduire
silencieusement une nouvelle règle pour tous les objets génériques ou toutes les
premières clés sans recouvrement.

La règle antérieure pour une cible sans recouvrement reste : avant sa première
clé, utiliser l'état d'origine ; ne pas créer automatiquement une clé initiale.
Les situations non couvertes par ces règles doivent être reconnues comme telles,
au lieu de choisir arbitrairement une extrapolation.

### Conflits à présenter à l'utilisateur

Un recouvrement n'est pas, à lui seul, un conflit à confirmer. Le mécanisme intervient
si aucune règle ne tranche le cas ou si plusieurs règles applicables produisent
des résultats incompatibles. Deux sélecteurs de même spécificité qui imposent des
valeurs différentes sur une même propriété peuvent notamment nécessiter ce choix.
L'ordre des lignes ne devient pas une priorité implicite non décidée.

Le diagnostic identifie les objets, les éléments concernés, la propriété et la
période affectée. Il explique le résultat des choix proposés. Le contexte de sélection
oriente la proposition, mais la résolution retenue est conservée dans le projet.

Lorsque cela résout le cas, la **solution A** propose de fixer explicitement une
valeur dès le début : la clé de départ est annoncée et créée après validation.
La résolution et ses changements sont annulables. Une clé de départ ne suffit
pas à masquer un conflit de priorité restant ; le choix doit effectivement lever
l'ambiguïté. Annuler le dialogue laisse les données inchangées.

L'intégration HTML détecte les recouvrements et applique les règles de ciblage.
Les commandes de clés et l'évaluation nécessaires à une résolution appartiennent
à la Timeline. Les sorties doivent suivre la résolution enregistrée.

## 7. Panneau de propriétés CSS

Le panneau reçoit les propriétés, leurs valeurs et les informations nécessaires
à leur présentation. Il émet un changement de propriété comprenant `oldValue`
et `newValue`. En usage autonome, l'application hôte lit, applique et conserve
les valeurs ; le panneau n'exige aucune instance de Timeline.

Dans le Designer, naviguer vers une autre image actualise le panneau et les outils
avec les valeurs évaluées par la Timeline. Cette actualisation ne crée aucune clé
et n'émet pas d'événement de modification utilisateur.

Toutes les propriétés CSS doivent pouvoir être présentées et éditées, avec une
saisie libre lorsque aucun contrôle spécialisé n'est disponible. Cette couverture
ne signifie pas que toute valeur permet une interpolation ou tous les exports.

Un groupe **Propriétés courantes**, optionnel dans le package et activé par le
Designer, rassemble notamment :

- position, dimensions et transformations ;
- opacité, marges et espacements ;
- fonds et dégradés ;
- bordures, arrondis et ombres ;
- typographie.

Le panneau distingue les propriétés incompatibles pour un groupe, les propriétés
modifiables par changement instantané et celles dont les valeurs permettent un
MotionTween. Une incapacité d'export CSS ne doit pas être présentée comme une
interdiction générale d'éditer ou de lire la propriété.

## 8. Outils visuels

Le Designer propose déplacement, redimensionnement, rotation et mise à l'échelle.
L'outil **Dimensions** agit sur largeur/hauteur ; la mise à l'échelle agit sur
`scaleX`/`scaleY`. Ces actions ne sont pas confondues.

Le pivot de rotation et de mise à l'échelle est déplaçable, avec des positions
prédéfinies au centre, sur les côtés et dans les coins. Déplacer le pivot seul
conserve la position visuelle de l'élément.

Les aides comprennent une grille optionnelle, des guides d'alignement avec le parent
et les autres éléments, l'accrochage activable et sa désactivation temporaire pendant
un geste, ainsi que les déplacements précis au clavier.

Les gestes conservent les unités CSS existantes lorsqu'une conversion est possible.
Si une expression telle que `calc(...)` ou `var(...)` ne peut pas être conservée,
son remplacement est proposé explicitement avant modification.

Un geste X/Y ou largeur/hauteur peut modifier plusieurs propriétés. Chacune reçoit
sa propre clé et son événement ; le geste entier représente une seule action
d'annulation. Cela n'autorise pas un MotionTween commun à plusieurs lignes.

## 9. Édition des dégradés

Le Designer couvre les dégradés linéaires, radiaux et coniques. Leur présentation
s'inspire de Microsoft Expression Blend 4 : barre de dégradé avec points de couleur,
édition de la couleur et de l'opacité du point sélectionné, choix du type et
paramètres de géométrie. Les contrôles du panneau et les poignées sur la scène
restent synchronisés.

Les paramètres disposent de clés et transitions indépendantes, regroupées sous
une ligne **Dégradé** dans la Timeline : angle, couleurs, positions, opacités des
points et géométrie propre au type de dégradé.

Ajouter ou supprimer un point est un changement de structure à l'image choisie.
Les autres points conservent leur identité et leurs animations. Aucun fondu,
déplacement ou état antérieur n'est inventé automatiquement. Pour obtenir cet
effet, l'utilisateur définit les valeurs correspondantes dans la clé précédente,
puis crée une transition compatible.

Un état de départ et un état d'arrivée incompatibles empêchent le MotionTween de
la propriété concernée, avec une explication permettant de corriger les données.
La représentation interne des points et des couleurs reste un choix technique.

## 10. Contrat temporel attendu de JsAnimationTimeline

Ces comportements appartiennent à la Timeline. Le Designer lui transmet des
modifications de propriété et utilise ses valeurs évaluées.

### Clés et pistes

La numérotation reste de 1 à N. L'ancienne expression « frame 0 » désignait le début.
Une modification enregistre la clé de la propriété à l'image courante, en la créant
ou en la modifiant. La ligne apparaît lorsque cette propriété est enregistrée.
La Timeline n'affiche pas d'emblée toutes les propriétés CSS non utilisées.

Créer une clé sans changer sa valeur capture la valeur évaluée à cette image, y
compris au milieu d'un MotionTween. Une telle clé n'est pas un reset, un effacement
ou un masquage. L'état de base n'est pas sa destination implicite.

Sans MotionTween, une clé maintient sa valeur jusqu'à la suivante ; la dernière
valeur reste après la dernière clé. La règle avant la première clé et le cas de
recouvrement confirmé sont décrits en section 6.

Chaque propriété possède ses clés et transitions indépendantes. Modifier la position
à 50 ne crée aucune clé d'opacité et ne modifie pas un tween d'opacité de 1 à 100.

### MotionTween

La commande exige exactement deux clés sélectionnées sur la même ligne de propriété.
Elle est désactivée pour zéro, une ou plus de deux clés, ou plusieurs lignes.
Elle ne crée pas des interpolations sur plusieurs propriétés à la fois.

Un avertissement non bloquant laisse créer la transition. Une incompatibilité
bloquante la refuse et explique la propriété, la plage et la cause. Une modification
de clé qui rendrait une transition existante invalide est refusée : l'utilisateur
peut adapter les valeurs ou supprimer d'abord cette transition. Elle n'est pas
supprimée silencieusement.

Insérer une clé à 50 au milieu d'un tween 1–100 capture la valeur interpolée et
produit deux transitions indépendantes, 1–50 et 50–100. L'insertion seule préserve
exactement le mouvement, y compris avec un easing non linéaire. Ensuite, chaque
transition peut être modifiée, supprimée ou recevoir son propre easing.

Pour imposer à 50 la valeur de la clé 1, le parcours décrit par l'utilisateur est
de supprimer le tween, créer la clé à 50, lui attribuer la valeur voulue, puis
recréer ou non les transitions.

### Historique commun

Les opérations du panneau, des outils et de la Timeline participent à un historique
cohérent coordonné par le Designer. Annuler/rétablir restaure les valeurs, les clés
et l'aperçu. Échap annule le geste en cours. Les packages réutilisables ne doivent
pas imposer des historiques concurrents à cette intégration.

## 11. Modifications du document original et Full XPath

L'ajout ou le changement d'un ID ou d'une classe nécessaire au ciblage est une
modification persistante distincte des styles d'aperçu. Le choix est conservé dans
le projet et transmis à l'application hôte, qui conserve ou réapplique les attributs
dans son HTML.

Les modifications du document original doivent être signalées dans l'interface
et par événement. Une liste des changements d'identifiant comprend le **Full XPath**
de l'élément dans le document original et l'ancienne/nouvelle valeur. Par exemple :

| Full XPath | Attribut | Ancienne valeur | Nouvelle valeur |
| --- | --- | --- | --- |
| `/html/body/div[1]/ghcc-consent` | `id` | absent | `MonConsentement` |

Ce chemin ne doit pas être remplacé uniquement par un sélecteur fondé sur le nouvel
ID. La forme exacte des événements et des données exportées reste à définir ;
l'information nécessaire à l'hôte et à l'utilisateur est une exigence fonctionnelle.
Les changements de classes restent eux aussi signalés et conservés.

La vérification d'un XPath sur un document qui a changé et le mécanisme de
rattachement sont des sujets techniques ; aucun remplacement de source ne doit
être supposé réussir si la cible ne correspond plus.

## 12. Sauvegarde et sorties

### Projet éditable

Le projet conserve les objets, leurs sélecteurs, les clés originales, MotionTween,
easings, données de conception, changements du document et résolutions de conflits.
Il permet de reprendre l'édition. Il n'est pas remplacé par les images calculées
d'un export de lecture.

### JSON de lecture

Le modèle demandé est un dictionnaire numéro d'image vers objet de valeurs
modifiées, organisé par objet ciblé. L'export complet contient cadence, durée et
les dictionnaires des objets. Les noms de champs exacts ne sont pas imposés ici.

Chaque image couverte par un MotionTween contient ses valeurs préévaluées. Hors
MotionTween, l'export enregistre les changements nécessaires pour reproduire les
états attendus. Il ne contient pas de retour automatique à l'image suivante ni de
sentinelle de reset inventée.

Pour le cas 59, la sortie doit permettre les 80 % dès le début, même si la seule
clé éditable de l'objet spécifique reste à 50. Les données initiales de lecture
ne constituent pas de nouvelles clés dans le projet éditable.

Un accès direct à une image doit donner le même état que la lecture jusqu'à cette
image. Le mécanisme de reconstruction est à concevoir. Pour les objets génériques,
les propriétés et valeurs ne doivent pas imposer de concepts CSS ou DOM.

### JavaScript autonome et CSS

Pour les cibles HTML, l'application peut choisir un JavaScript autonome appliquant
uniquement les propriétés pilotées à l'attribut `style`, ou un export d'animation
CSS. Le JavaScript HTML n'est pas appliqué à des objets génériques.

Le CSS, le JavaScript et le lecteur JSON doivent reproduire le même ciblage, les
mêmes valeurs, les mêmes priorités et les résolutions enregistrées. L'export CSS
est refusé s'il ne peut pas reproduire fidèlement une animation pourtant valide
dans le lecteur. Expliquer les incompatibilités et proposer JavaScript ou JSON.
Ne pas produire silencieusement un résultat CSS partiel.

La sauvegarde du projet éditable reste disponible indépendamment des limitations
d'un format d'export.

## 13. Exemples d'acceptation à conserver pour les tests et démos

Ces scénarios sont des attentes fonctionnelles ; aucun test n'a été ajouté ni
exécuté pendant la rédaction. Ils devront devenir des tests réutilisables et,
pour les parcours visuels, des validations Playwright lors de l'implémentation.

| Scénario | Résultat observable |
| --- | --- |
| Sélectionner un élément pour l'inspecter. | Arbre, scène et panneau cohérents ; aucun objet créé avant une modification. |
| Naviguer vers une autre image. | Panneau et outils actualisés avec les valeurs évaluées ; aucune clé créée ni modification utilisateur émise. |
| Sélectionner un groupe `.button`. | Tous ses éléments surlignés ; propriétés divergentes marquées individuellement. |
| Modifier `margin-top` dans un groupe dont les valeurs de base divergent. | Modification collective refusée avec explication et proposition d'ID individuels. |
| Ajouter une position à 50 pendant un tween d'opacité 1–100. | Nouvelle piste de position ; aucune clé ni courbe d'opacité modifiée. |
| Créer des clés bleues à 11/19/21, puis rouge à 10 et jaune à 20. | Rouge à 10, bleu à 11–19, jaune à 20, bleu à partir de 21. |
| Créer 21 après avoir fixé jaune à 20, sans autre clé ni tween. | La nouvelle clé capture jaune, pas la couleur du CSS d'origine. |
| Insérer une clé à 50 dans un tween non linéaire 1–100. | Deux transitions indépendantes ; mouvement identique avant toute édition supplémentaire. |
| Sélectionner trois clés ou deux lignes pour créer un tween. | Commande désactivée. |
| Modifier une clé en rendant son tween incompatible. | Refus expliqué ; clé et transition existantes conservées. |
| Déplacer un élément en X/Y puis annuler. | Les deux propriétés, leurs clés et l'aperçu sont restaurés ensemble. |
| Déplacer uniquement le pivot. | Position visuelle de l'élément conservée. |
| Ajouter un point de dégradé. | Changement à l'image choisie ; autres points et animations préservés. |
| Jouer le cas 59 aux images 1, 20, 49, 50 et suivantes. | Bouton spécifique à 80 %, autres boutons à 50 % ; aucun dialogue ni clé à 1 ajoutée. |
| Cible sans recouvrement, opacité d'origine 100 %, première clé à 50 = 80 %. | Selon 41A : 100 % avant 50, puis 80 % ; aucune clé initiale ajoutée. Le cas 59 ne s'étend pas silencieusement à cette situation. |
| Détecter deux règles incompatibles sans priorité établie. | Diagnostic et choix explicite ; résolution enregistrée et annulable. |
| Accepter A dans un conflit qui nécessite une valeur de départ. | Clé initiale annoncée puis créée ; annuler restaure l'état précédent. |
| Déplier automatiquement puis changer de sélection. | Restauration du choix manuel de repli. |
| Attribuer un nouvel ID. | Signalement UI, événement et liste Full XPath avec anciennes/nouvelles valeurs. |
| Sauvegarder puis rouvrir. | Clés et courbes originales, ciblage et résolutions conservés. |
| Exporter le cas 59 puis accéder directement à l'image 20. | Même résultat que la lecture depuis le début, sans dépendance à la sélection d'édition. |
| Exporter en CSS un effet non reproductible fidèlement. | Refus expliqué ; alternatives JS/JSON et sauvegarde éditable disponibles. |
| Utiliser une cible générique dans la Timeline. | Valeurs génériques sans logique DOM imposée ; pas de JavaScript d'application de styles HTML. |

## 14. Choix techniques ultérieurs et références

Les signatures d'API, noms de packages, schémas de persistance, représentation des
couleurs/dégradés, transactions d'historique, mécanismes d'inspection CSS et forme
des diagnostics seront définis lors de la conception technique. Ils devront
respecter ces comportements et l'autonomie des contrôles. Ce document ne choisit
ni bibliothèque d'interface ni framework et ne lance pas leur implémentation.

Le contrat cible de la Timeline accompagne ce document et sépare les garanties
attendues de l'API actuellement observée. L'audit détaillé du code reste dans le
dépôt Timeline ; il n'est pas requis pour comprendre ou utiliser ces spécifications.

Les références d'inspiration ne remplacent pas les décisions utilisateur :

- [Microsoft Expression Blend 4 Step by Step, extrait officiel](https://www.microsoftpressstore.com/content/images/9780735639010/samplepages/9780735639010.pdf) : texte consulté pour le panneau de dégradé, les points, couleurs et alpha ; les dégradés coniques sont une demande de ce projet. Les captures du PDF n'ont pas été inspectées.
- [Clés de propriété dans Adobe Animate](https://helpx.adobe.com/animate/desktop/animation/using-property-keyframes.html) et [division des plages](https://helpx.adobe.com/animate/desktop/animation/setting-animation-tween-spans-in-the-timeline.html) : références consultées pour distinguer insertion et division. La conservation exacte du mouvement demandée ici ne doit pas être présentée comme une garantie générale de Flash CS4.

Aucune création de dépôt, publication de package, modification de code ou fusion
vers `main` n'est autorisée par la seule rédaction de ces spécifications.
