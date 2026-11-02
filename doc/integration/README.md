<!-- doc/integration/README.md -->
# Passation HtmlAnimation ↔ JsAnimationTimeline

Édition du 30 octobre 2026. Dossier documentaire autonome ; aucun accès à l'autre
session n'est nécessaire. Les droits d'accès aux conversations et aux dossiers
peuvent varier selon l'outil : ils ne constituent pas un mécanisme de coordination.

## Lire dans cet ordre

1. [Spécifications du Designer](specifications-designer.md) — produit, contrôles,
   comportements décidés, cas de référence et critères d'acceptation.
2. [Contrat cible de Timeline](timeline-contract.md) — garanties futures attendues,
   état actuel observé, opérations conceptuelles et scénarios de conformité.
3. [Message de démarrage pour la session Designer](designer-session.md) — contexte
   à transmettre à la session qui travaillera dans HtmlAnimation.

Les documents suffisent sans relire les discussions et sans suivre les références
numérotées aux anciennes questions. Les cas concernés sont décrits intégralement.
Les liens relatifs restent à l'intérieur de ce dossier ; les références externes
d'inspiration sont facultatives pour comprendre le besoin.

## Dépôts et responsabilité des documents

| Chantier | Dépôt | Clone local communiqué |
| --- | --- | --- |
| Designer et deux contrôles réutilisables | `Kazo-ca/HtmlAnimation` | `C:\Users\clefw\repos\source\HtmlAnimation` |
| Moteur et éditeur temporels | `Kazo-ca/JsAnimationTimeline` | `C:\Users\clefw\repos\source\JsAnimationTimeline` |

| Document | Référence initiale | Autorité après cette passation |
| --- | --- | --- |
| `specifications-designer.md` | HA-DESIGN-001 / révision 1. | Chantier HtmlAnimation ; copie de référence côté Timeline. |
| `timeline-contract.md` | HA-TL-001 / révision 1. | Chantier Timeline ; copie de référence côté HtmlAnimation. |
| Ce dossier et le message de démarrage | Passation du 30 octobre 2026. | Coordination documentaire ; pas un état vivant des exécutions. |

Chaque modification d'une garantie partagée doit incrémenter sa révision et expliquer
le changement. Copier la révision complète à l'autre chantier et vérifier son contenu
avant de la consommer. Si l'autre dossier n'est pas accessible, joindre le document
à la session correspondante ou le transmettre par une branche/PR explicitement
identifiée. L'historique d'un chat n'est pas la source de vérité du contrat.

Ne pas écraser une copie modifiée par l'autre chantier : comparer d'abord les
révisions et les différences. Les noms de fichiers et leurs liens sont identiques
dans les deux dépôts pour permettre une copie autonome. Une synchronisation de
documents ne vaut ni livraison de package ni validation de l'intégration.

## État au moment de la passation

| Élément | État documentaire connu |
| --- | --- |
| Décisions produit | Consolidées dans HA-DESIGN-001 / r1. |
| Garanties attendues de la Timeline | Décrites dans HA-TL-001 / r1. |
| API actuelle de la Timeline inspectée | Snapshot `e90be9d5338b81ad644455c89ca64d22c526eb09` ; capacités et limites dans le contrat. |
| API exacte du futur raccordement | Correspondance de méthodes/types à fournir par le chantier Timeline. |
| Implémentation des garanties manquantes | Non réalisée par la préparation de cette passation. |
| Tests de conformité du futur contrat | Non exécutés ; scénarios TL-C01 à TL-C16 à conserver. |
| HtmlAnimation au début de la passation | Clone existant avec sa licence ; aucune implémentation ajoutée ici. |
| Nouvelle session Designer | Aucun chat créé ni message envoyé par cette passation. |

## Avancer en parallèle

Le chantier HtmlAnimation peut concevoir les deux contrôles autonomes, les parcours
du Designer, la sélection, les outils et les diagnostics à partir des spécifications.
Pour les échanges Timeline, utiliser une frontière d'adaptation et, lorsque le
travail d'implémentation sera autorisé, des scénarios simulés identifiés comme tels.
Ils ne doivent pas devenir un second moteur temporel livré dans le Designer.

Le chantier Timeline est responsable des clés/pistes, des règles d'évaluation,
des transitions, des opérations d'historique nécessaires et des garanties de lecture.
Il fournit la correspondance de l'API future et une référence exécutable précise
pour remplacer les simulations. Il peut consulter la spécification Designer copiée
localement pour comprendre les parcours consommateurs.

Le travail en parallèle ne nécessite pas que les versions actuelles satisfassent
déjà le contrat futur. En revanche, le raccordement final exige les mêmes versions
de documents, une version/commit réel de Timeline et des tests des deux côtés.

## Informations à échanger lors d'une évolution

Chaque chantier consigne dans sa passation de suivi :

- révision du contrat consommée et document modifié, le cas échéant ;
- branche et commit concernés, ou indication « changements locaux non commités » ;
- capacités réellement disponibles, capacités encore simulées et écarts connus ;
- scénarios de conformité exécutés, résultats et tests Playwright pertinents ;
- modification d'API ou de schéma avec la correspondance de l'ancien vers le nouveau.

Les mécanismes techniques peuvent être conçus sans redemander les choix produit
déjà tranchés. Une proposition qui change un comportement décidé doit être identifiée
comme telle et soumise à l'utilisateur. Les conflits d'animation non couverts suivent
le mécanisme fonctionnel prévu, pas une priorité inventée par l'implémentation.

## Règles de travail à emporter

- Les documents n'autorisent pas à coder pendant la discussion de spécification.
  L'autorisation d'implémenter viendra de la demande adressée à chaque chantier.
- Interface en français ; code, commits et PR en anglais. Conserver les instructions
  locales du dépôt et les règles personnelles ECC lorsqu'elles sont disponibles.
- Avant une implémentation, suivre les règles ECC et les agents exigés par l'utilisateur ;
  la préparation de ces documents n'est pas une revue ECC du futur code.
- Pas de `any` ; chaque nouveau fichier commence par son chemin relatif dans un
  commentaire adapté. Les styles de la Timeline restent sous `.JsTimeLine` ; le
  nommage/scoping des nouveaux contrôles est à définir dans leur propre dépôt.
- Commandes fonctionnelles annulables et tests d'annulation ; tests Playwright
  des parcours visuels et scénarios réutilisables dans les démos.
- Builds/tests en commandes ordinaires, jamais via UltraCode. Les contrôles de
  validation propres à chaque dépôt restent applicables.
- Ne pas fusionner de PR vers `main` sans approbation de l'utilisateur, sauf
  instruction explicite contraire. Aucun package n'est publié par cette passation.
