# Édition et affichage des documents

## Choix de l’éditeur

```mermaid
flowchart TD
    Page["DocumentPage : chargement par identifiant"] --> Type{"Document.type"}
    Type -->|TEXT| Segments["Segments de texte, code et planificateurs"]
    Type -->|EXCEL| Sheet["SpreadsheetEditor"]
    Type -->|TODO| Todo["TodoEditor"]
    Segments --> Markdown["Rendu Markdown / édition du texte"]
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

La page consulte aussi `/api/document-histories/:id` pour les anciennes versions et `/api/conversations/:id` pour les échanges IA. Les appels IA passent par `/api/ai-client`.

## Commandes de l’éditeur

`app/src/commands.ts` définit `/planificateur`, `/scrape`, `/hello`, `/date`, `/time`, `/divider`, `/code`, `/quote`, `/list` et `/checkbox`. Les deux premières ouvrent une fenêtre de sélection ou de saisie ; les autres insèrent du texte. `/scrape` crée une instance, interroge son statut périodiquement et exploite le résultat.

Sources : [page document](../../../app/src/DocumentPage.tsx), [bloc de code](../../../app/src/components/CodeBlock.tsx), [segments](../../../app/src/utils/documentSegments.ts), [commandes](../../../app/src/commands.ts), [temporisation](../../../app/src/hooks/useDebounce.ts), [bloc planificateur](../../../app/src/components/SchedulerBlock.tsx), [contrôleur document](../../../api/src/controllers/documentController.ts).
