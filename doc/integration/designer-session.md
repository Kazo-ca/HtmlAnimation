<!-- doc/integration/designer-session.md -->
# Message de démarrage pour la session HtmlAnimation

Le texte suivant peut être donné à une nouvelle session, sans copier la discussion
qui a produit les spécifications. Le dossier `doc/integration/` doit l'accompagner
si cette session n'a pas accès au clone local.

---

Tu travailles sur `Kazo-ca/HtmlAnimation`, cloné dans
`C:\Users\clefw\repos\source\HtmlAnimation`.

Le projet contient trois futurs packages JS/TS publiés indépendamment : un Designer
HTML, un panneau de propriétés CSS réutilisable et HierarchicalDomTree réutilisable.
JsAnimationTimeline reste dans un autre dépôt et un autre chantier.

Commence par lire :

1. `doc/integration/README.md` pour la coordination et l'état de passation.
2. `doc/integration/specifications-designer.md` — HA-DESIGN-001 / révision 1.
3. `doc/integration/timeline-contract.md` — HA-TL-001 / révision 1.

Ces documents sont le contexte complet de référence. Tu n'as pas besoin de lire
une autre session ou le dossier de JsAnimationTimeline pour comprendre le besoin.
Le contrat Timeline décrit la cible future : ne présente pas ses garanties comme
déjà disponibles dans le package npm actuel.

Le Designer reçoit un conteneur HTML déjà rempli, un conteneur de propriétés,
un conteneur d'arbre DOM et une instance Timeline. Les deux contrôles réutilisables
restent indépendants de la Timeline ; le Designer orchestre l'ensemble. Ne réimplémente
pas le moteur temporel dans HtmlAnimation pour compenser une capacité manquante.

Les comportements déjà décidés ne sont pas à remettre en discussion. En particulier,
le cas d'opacité groupe/ID décrit intégralement dans les documents donne 80 % au
bouton spécifique pendant toute la durée, sans clé initiale supplémentaire ni
dialogue. Les conflits réellement non couverts sont détectés et résolus explicitement.

Les changements persistants d'ID/classes sont distingués des styles temporaires
d'aperçu. Les modifications du document original sont signalées dans l'interface
et par événement ; la liste de changements d'ID contient Full XPath et anciennes/
nouvelles valeurs. Le code temporel générique n'a pas à connaître le XPath.

Prépare ton travail propre à HtmlAnimation en respectant le périmètre demandé dans
cette nouvelle session. La passation elle-même ne constitue pas une autorisation
de coder : elle permet d'établir le travail et le raccordement sans perdre les
décisions. Lorsque l'implémentation sera autorisée, les composants et parcours
peuvent avancer avec une simulation identifiée du contrat, puis être raccordés
à la référence réelle fournie par le chantier Timeline.

Conserve les scénarios de test pour les démos et couvre les parcours visuels avec
Playwright. Avant de coder, lis les instructions du dépôt et les règles personnelles
ECC disponibles ; utilise les agents/revues demandés. Interface française, code/
commits/PR anglais, pas de `any`, commandes annulables et validation appropriée.
Les PR vers `main` sont toujours approuvées par l'utilisateur, sauf demande explicite
contraire. Ne crée pas de publication ni ne modifie l'autre dépôt par déduction.

---

Ce texte n'a pas été envoyé automatiquement à une autre session.
