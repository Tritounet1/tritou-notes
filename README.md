# Tritou Notes

Application de prise note en ligne perso avec plusieurs fonctionnalités :

- Récupération de données en ligne, avec des scrapers programmables.
- Intégration de l'ia pour l'écriture / modification des documents.

## Structure

```
api/
├── app/ // frontend app
├── api/ // backend app (REST api)
├── docker/
│   ├── api/
│   │   └── Dockerfile   // Dockerfile for backend app
│   ├── app/
│   │   └── Dockerfile   // Dockerfile for the frontend app
│   └── docker-compose.yml //
└── README.md //
```

- Possibilité de rendre des notes ouverte au public (c'est possible mais faire en sorte que sur le frontend ça prenne en compte ça)
- Un dashboard avec les liste des users invités (et pouvoir inviter un user, ce qui lui envoie un mail avec ses identifiants à créer : username et password)

Il faut faire :

- scraper pour récupérer automatiquement des infos sur un site (pour faire de la veille automatique)
- trouver un meilleur nom de fichier pour les routes et controlleur : aiClientRoutes
- améliorer l'utilisation de l'ia dans le front d'un document (l'ia peut automatiquement intégrer le contenu générer dans le document)
- Modifier la sécurité du token (localStorage dans le front, mettre en place https Cookie ou chercher autre chose)
- Rajouter un context des messages précédents envoyés à l'ia ? (ça peut être très couteux en token donc je pense pas)
- Pouvoir créer des tableaux excel (donc avoir des documents ou on rajoute la colonne type : text (donc ce qu'il y a déjà) et excell pour tableau comme excell)
- Connexion websocket pour la modifications des notes (avec la possibilité de la faire avec une autre personne et voir qui modifie quoi, ...)

L'user admin peut ensuite inviter d'autre user avec des permissions choisis. (une autre table à faire pour les permissions)

TODO modèle :

- [ ] permission
      -> Concernant modèle, c'est une table qui est déjà rempli avec toutes les permissions nécéssaires (accès dashboard, lancer scraper, créer scraper, modifier scraper, ...) donc sur le frontend on pourras pas créer des permissions seulement attribuer des permissions à des users. (Un compte admin qui est le compte principal et que des comptes user ou on décide les permisions, on peut ajouter d'autre admin mais c'est pas urgent ça)

TODO controller :

- [ ] permissionController

TODO routes :

- [ ] permissionRoutes

TODO config :

- [ ] crons
- [ ] mailClient

TODO permissions :

Les différentes permissions imaginer pour l'instant :

- scraperModify # Permet de configurer les scrapers
- scraperUse # Permet d'utiliser ou non les scrapers (c'est les instances de scrape)
- scraperStatus # Permet de changer le status d'un scraper (draft, active, ...)
- scraperDelete # Permet de supprimer un scraper
- documentCreate
- documentDelete
- documentModify
- aiUse

TODO docker :

- [ ] Finir le docker-compose (le Dockerfile du frontend à un problème)

## App (frontend)

### Technos

- TypeScript
- React
- Tailwind
- Eslint
- Vite

## Api (backend)

### Prisma

Sync the schema with the database

```sh
npx prisma db push
```

Generate the client :

```sh
npx prisma generate
```

### Technos

- TypeScript
- Express
- Dotenv
- Eslint
- Prettier

### Structure

```
api/
├── src/
│   ├── prima/
│   │   └── schema.prisma.ts   // Database schema
│   ├── config/
│   │   └── config.ts        // Load and type environment variables
│   ├── controllers/
│   │   └── itemController.ts  // CRUD logic for "items"
│   ├── middlewares/
│   │   └── errorHandler.ts    // Global typed error handling middleware
│   ├── models/
│   │   └── item.ts          // Define item type and in-memory storage
│   ├── routes/
│   │   └── itemRoutes.ts    // Express routes for items
│   ├── app.ts               // Express app configuration (middlewares, routes)
│   └── server.ts            // Start the server
├── .env                     // Environment variables
├── package.json             // Project scripts, dependencies, etc.
├── tsconfig.json            // TypeScript configuration
├── .eslintrc.js             // ESLint configuration
└── .prettierrc              // Prettier configuration
```
