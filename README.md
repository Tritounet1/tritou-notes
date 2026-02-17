# Tritou Notes

Tritou Notes est une application très personnel (donc sur mes envies), de prise de notes et de veille, l'application regroupe plusieurs fonctionnalités dont :

- Récupération de données en ligne, avec des scrapers programmables.
- Intégration de l'ia pour l'écriture / modification des documents.

## Structure

```
api/
├── app/ // frontend
├── api/ // backend
├── docker/
│   ├── api/
│   │   └── Dockerfile   // Dockerfile of the backend for production
│   ├── app/
│   │   └── Dockerfile   // Dockerfile of the frontend for production
│   ├── database/
│   │   └── docker-compose.yml   // Docker compose file contains a postgres database and redis, use for devellopement
│   └── docker-compose.yml // Docker compose file for start the frontend and backend services
└── README.md //
```

Les pages :

### Documents

Page des différents documents. (Texte, Excel et Todo list)

### Scrapers

Page administrateur pour créent et gérés les différents scrapers.

### Instances

Page administrateur pour lancer des scrapes. (lien directe vers un site) Cette page permet de tester les scrapers créent.

### Planificateurs

Page administrateur pour planifier des tâches de scraping.

### Utilisateurs

Page administrateur qui permet de lister tout les utilisateurs (admin ou non) et aussi inviter de nouveaux utilisateurs.

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

### Test ci

```sh
brew install act
```

Et pour le lancer :

```sh
act
act --container-architecture linux/amd64
```
