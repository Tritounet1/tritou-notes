# Édition et affichage des documents

## Choix de l’éditeur

```mermaid
flowchart TD
    Page["DocumentPage : chargement par identifiant"] --> Type{"Document.type"}
    Type -->|TEXT| Segments["Segments de texte, code, liens, images et planificateurs"]
    Type -->|EXCEL| Sheet["SpreadsheetEditor"]
    Type -->|TODO| Todo["TodoEditor"]
    Segments --> Markdown["Rendu Markdown / édition du texte"]
    Segments --> Images["ImageBlock : largeur et légende"]
    Images --> Save
    Segments --> Links["WebLinkBlock : URL, embed ou aperçu"]
    Links --> Save
    Segments --> Code["CodeBlock : CodeMirror et choix du langage"]
    Code --> Save
    Segments --> Scheduler["SchedulerBlock"]
    Scheduler --> Preview["GET /api/scraping-schedulers/:id/preview"]
    Preview --> Template{"Template du scraper présent ?"}
    Template -->|Oui| Render["ScraperTemplateRenderer"]
    Template -->|Non| Table["Conversion JSON vers tableau Markdown"]
    Markdown --> Save["Sauvegarde via API"]
    Sheet --> Save
    Todo --> Save
```

Les trois formats sont stockés dans le champ `Document.text`. Un bloc planificateur est sérialisé sous la forme `::scheduler[42]::` au milieu du texte. `SchedulerBlock` charge son aperçu au montage et quand son identifiant change ; il n’effectue pas de rafraîchissement périodique.

## Blocs de code

La commande `/code` insère un bloc dédié, éditable avec CodeMirror. La barre d’outils en haut à droite propose un langage, la copie de tout le contenu et un menu de suppression. Le langage est enregistré dans la clôture Markdown, par exemple ` ```python `. La coloration est chargée à la demande ; les blocs sans langage restent en texte brut. Les lecteurs peuvent copier le code, mais ne peuvent pas le modifier.

`utils/documentSegments.ts` sépare les blocs clôturés du texte et des planificateurs. Les marqueurs `::scheduler[id]::` dans le code restent littéraux. Les clôtures sont allongées si le contenu contient lui-même une ligne de triples accents graves.

## Liens web

Un lien seul peut être affiché comme URL, embed ou aperçu visuel. Voir [le parcours et le format de sauvegarde](liens-web.md).

## Images locales

La commande `/image` ouvre le sélecteur. Le dépôt de fichiers est disponible à l’intérieur de cette fenêtre. Les fichiers passent par Express et sont stockés localement ; aucun service supplémentaire n’est nécessaire. Voir [upload, accès et sauvegardes](images.md).

## Sous-pages

Une page peut avoir une page parente (`Document.parentId`). La commande `/page` et le « + » de l’arborescence de la sidebar créent une sous-page puis l’ouvrent. Dans une page texte, la sous-page est aussi insérée comme bloc `::page[id]::` ; retirer ce bloc ne supprime pas la sous-page, qui reste listée sous « Sous-pages ». `GET /api/documents/:id` renvoie `ancestors` (fil d’Ariane) et `children` ; le bouton « Déplacer » envoie `parentId` dans `PUT /api/documents/:id`, l’API refusant une page déplacée sous elle-même ou sous une de ses sous-pages. Supprimer une page supprime ses sous-pages.

## Dossiers

Les dossiers (`Folder`, `/api/folders`) rangent les pages racines ; une sous-page reste sous sa page parente et suit son dossier. Dans la sidebar, les dossiers sont fermés par défaut (état mémorisé dans le navigateur) et s’ouvrent seuls quand ils contiennent la page affichée ; leurs actions (nouvelle page, sous-dossier, renommer, déplacer, supprimer) n’apparaissent qu’au survol. Pages et dossiers se déplacent par glisser-déposer sur un dossier, ou sur « Pages » pour revenir à la racine ; « Déplacer la page » propose aussi les dossiers. Supprimer un dossier ne supprime aucune page : pages et sous-dossiers remontent d’un niveau. L’assistant dispose de `list_folders` et de `folderId` sur `create_page` / `move_page`.

## Sauvegarde et historique

```mermaid
sequenceDiagram
    participant UI as DocumentPage
    participant D as useDebounce
    participant API as API Express
    participant DB as PostgreSQL
    UI->>D: Modification via debouncedSave
    D->>D: Attendre 1000 ms sans nouvel appel
    D->>API: PUT /api/documents/:id
    API->>DB: Lire la version actuelle
    API->>DB: Créer DocumentHistory avec l’ancien contenu
    API->>DB: Mettre à jour Document et last_update
    API-->>UI: Document mis à jour
```

Un enregistrement encore en attente quand la page est quittée est envoyé immédiatement au lieu d’être perdu. La route `/document/:id` remonte la page à chaque changement de document.

La page consulte aussi `/api/document-histories/:id` pour les anciennes versions.

## Assistant IA

Le panneau « Assistant » (et la page `/assistant` pour les conversations globales) utilise `components/AiChat.tsx` et `/api/ai`. Le serveur appelle OpenRouter avec le modèle texte choisi dans Paramètres et exécute une boucle d’outils (`api/src/ai/`) qui couvre toute l’app : pages (lister, chercher, lire, créer, modifier avec `edit_page` / `append_to_page` / `rewrite_page`, déplacer, supprimer), to-do (`update_todos`), tableurs (`set_cells`, grille A1–Z50 avec formules), dossiers, scrapers, planificateurs (URL, cron, activation), instances (`run_scrape`, `wait_for_instance`) et, pour les administrateurs, permissions des utilisateurs. Les outils appliquent les mêmes permissions que les routes et passent par les mêmes services (`api/src/services/`), notamment pour la planification BullMQ ; les suppressions ne sont faites que sur demande explicite. La réponse est diffusée en server-sent events (texte au fil de l’eau, outil en cours, actions terminées, puis `done`) ; le bouton « Arrêter » annule aussi l’appel OpenRouter. Derrière nginx, l’en-tête `X-Accel-Buffering: no` évite la mise en mémoire tampon du flux. Chaque modification passe par `reviseDocument` et crée donc une entrée d’historique ; la page ouverte est rechargée quand l’assistant la modifie. Les pièces jointes (images, PDF, fichiers texte ; 5 × 10 Mo) sont envoyées en data URL. `/image-ia` génère une image avec le modèle d’image et l’insère comme bloc image.

## Commandes de l’éditeur

`app/src/commands.ts` définit `/page`, `/image`, `/image-ia`, `/planificateur`, `/scrape`, `/date`, `/time`, `/divider`, `/code`, `/quote`, `/list` et `/checkbox`. `/page` crée une sous-page ; `/image`, `/image-ia`, `/planificateur` et `/scrape` ouvrent une fenêtre de sélection ou de saisie ; les autres insèrent du texte. `/scrape` crée une instance, interroge son statut périodiquement et exploite le résultat.

Sources : [page document](../../../app/src/DocumentPage.tsx), [bloc de code](../../../app/src/components/CodeBlock.tsx), [segments](../../../app/src/utils/documentSegments.ts), [commandes](../../../app/src/commands.ts), [temporisation](../../../app/src/hooks/useDebounce.ts), [bloc planificateur](../../../app/src/components/SchedulerBlock.tsx), [contrôleur document](../../../api/src/controllers/documentController.ts).
