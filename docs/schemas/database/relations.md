# Tables et relations PostgreSQL

Le schéma Prisma contient 13 modèles. Ce diagramme reprend leurs champs persistés et leurs relations ; les champs de navigation Prisma ne sont pas des colonnes SQL.

```mermaid
erDiagram
    User {
        Int id PK
        String email UK
        String username
        String password
        Role role
    }
    Document {
        Int id PK
        String title
        String text
        Boolean public
        DateTime created_at
        DateTime last_update
        Int authorId FK
        DocumentType type
        Int parentId FK "nullable"
    }
    DocumentImage {
        UUID id PK
        Int documentId FK
        String filename
        String mimeType
        Int size
        Int width
        Int height
        DateTime created_at
    }
    ScrapingScheduler {
        Int id PK
        String title
        String description "nullable"
        String cron_expression "nullable"
        DateTime start_at "nullable"
        DateTime last_run_at "nullable"
        DateTime next_run_at "nullable"
        ScrapingSchedulerStatus status
        DateTime update_at
        DateTime created_at
    }
    DocumentHistory {
        Int id PK
        String title
        String text
        Boolean public
        DateTime created_at
        Int documentId FK
        Int authorId FK
    }
    Scraper {
        Int id PK
        String name
        String description "nullable"
        String code "nullable"
        Boolean browser
        String[] base_url
        ScraperStatus status
        DateTime created_at
        DateTime last_update
        Json display_template "nullable"
    }
    InstanceScrape {
        Int id PK
        String url
        Json response "nullable"
        InstanceScrapeStatus status
        DateTime created_at
        DateTime last_update
        Int scrapingSchedulerId FK "nullable"
        Int scraperId FK "nullable"
    }
    InstanceScrapeHistory {
        Int id PK
        String url
        Json response
        InstanceScrapeStatus status
        DateTime created_at
        Int instanceScrapeId FK
        Int scrapingSchedulerId FK "nullable"
    }
    Conversation {
        Int id PK
        String message
        String response
        String model_id
        Int documentId FK "nullable"
        Int authorId FK "nullable"
        DateTime created_at
    }
    UserPermissions {
        Int id PK
        Boolean modifyScraper
        Boolean useScraper
        Boolean modifyScraperStatus
        Boolean deleteScraper
        Boolean createDocument
        Boolean deleteDocument
        Boolean modifyDocument
        Boolean useAiChatBot
        Boolean accessScrapersPage
        Boolean accessInstancesScrapersPage
        Int userId FK,UK
    }
    Invitation {
        Int id PK
        String email
        String token UK
        Boolean used
        DateTime expires_at
        DateTime created_at
    }
    Settings {
        Int id PK
        String anthropicApiKey "nullable"
        String smtpUser "nullable"
        String smtpPassword "nullable"
        String smtpHost "nullable"
        Int smtpPort "nullable"
    }
    Images {
        Int id PK
        String name
        DateTime created_at
    }
    User ||--o{ Document : authorId
    Document ||--o{ DocumentImage : "documentId (cascade)"
    Document |o--o{ Document : "parentId (cascade)"
    Document ||--o{ DocumentHistory : documentId
    User ||--o{ DocumentHistory : authorId
    ScrapingScheduler |o--o{ InstanceScrape : scrapingSchedulerId
    Scraper |o--o{ InstanceScrape : scraperId
    InstanceScrape ||--o{ InstanceScrapeHistory : instanceScrapeId
    ScrapingScheduler |o--o{ InstanceScrapeHistory : scrapingSchedulerId
    Document |o--o{ Conversation : documentId
    User |o--o{ Conversation : authorId
    User ||--o| UserPermissions : userId
```

## Lecture

- `PK` : clé primaire ; `FK` : clé étrangère ; `UK` : contrainte d’unicité.
- `||` : exactement un ; `|o` / `o|` : zéro ou un ; `o{` : zéro à plusieurs.
- `nullable` : champ optionnel. `String[]` représente un tableau PostgreSQL.
- `UserPermissions.userId` est unique : un utilisateur possède au maximum une ligne de permissions.
- Les liens de `Conversation` vers un utilisateur et un document sont optionnels, comme les liens des instances vers un scraper ou un planificateur.

`Document.parentId` forme l’arborescence des sous-pages (`null` pour une page racine). Supprimer une page supprime toute sa descendance : la base cascade sur `parentId`, et le contrôleur supprime d’abord les historiques et les images de chaque page du sous-arbre.

Les fichiers de `DocumentImage` sont stockés localement par Express, hors PostgreSQL. La relation `documentId` supprime les métadonnées en cascade ; le contrôleur supprime aussi le dossier du document.

`Invitation`, `Settings` et `Images` n’ont aucune clé étrangère. Il n’existe pas de relation SQL entre `Document` et `ScrapingScheduler` : le frontend stocke une référence textuelle `::scheduler[id]::` dans `Document.text`.

Source : [schéma Prisma API](../../../api/prisma/schema.prisma). Le serveur MCP possède également son [schéma Prisma](../../../mcp/prisma/schema.prisma) pour accéder à la même base.
