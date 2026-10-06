# Documentation technique

Les schémas décrivent le code actuel de Tritou Notes. Les blocs `mermaid` sont affichables dans un lecteur Markdown compatible, notamment GitHub.

## Schémas

| Domaine | Documents |
| --- | --- |
| API | [Architecture et routes](schemas/api/architecture.md), [Authentification et scraping](schemas/api/flux.md) |
| Frontend | [Architecture et navigation](schemas/app/architecture.md), [Édition des documents](schemas/app/documents.md), [Liens web](schemas/app/liens-web.md) |
| Base de données | [Tables et relations](schemas/database/relations.md), [Modèles et états](schemas/database/modeles.md) |

## Maintenance

Mettre à jour les relations après une modification de `api/prisma/schema.prisma`, les routes après une modification des routeurs Express ou de `app/src/App.tsx`, et les flux après une modification des contrôleurs ou du worker. Les liens « Sources » de chaque page pointent vers le code correspondant.
