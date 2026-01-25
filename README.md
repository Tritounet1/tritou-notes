# Tritou Notes

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

Application de prise note en ligne perso (un siteweb) avec récupération de données en ligne. (scraper)

- Possibilité de rendre des notes ouverte au public
- Rajouter le fait que les visiteurs (ou que les gens connéctés) peuvent contribuer à une notes (créer un système de versionnening comme sur github)
- Fonctionnalités ia que au utilisateur connécté (admin ou certain user)
- Un dashboard avec les liste des users invités (et pouvoir inviter un user, ce qui lui envoie un mail avec ses identifiants à créer : username et password)

Il faut faire :

- scraper pour récupérer automatiquement des infos sur un site (pour faire de la veille)
- clés api mistral pour ce qui est ia (simplifier du contenu, rechercher rapidement un mot, ...)

Par défaut un user admin est défini lors de la première connection à l'app, il peut ensuite inviter d'autre user avec des permissions choisis. (une autre table à faire pour les permissions)

TODO modèle :

- [ ] permission

TODO controller :

- [ ] scraperController
- [ ] permissionController

TODO routes :

- [ ] scraperRoutes
- [ ] permissionRoutes

TODO config :

- [ ] crons
- [ ] mailClient

TODO docker :

- [ ] tester le dockerfile de l'api
- [ ] Finir le dockerfile de l'app (frontend avec nginx ou voir autre chose si trouvé mieux)
- [ ] Finir le docker-compose

TODO final api :

- [ ] clean le code quand les fondations de l'api sont fini (pas mal de code inutile utilisé au démarrage du projet)

Gestion des browsers pour les scrapers, à ne pas oublier de faire :

- ne pas charger le css et les images
- ouvrir et fermer le navigateur quand on a besoin et quand on a terminé avec

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

Generate client :

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

(template de l'api : https://blog.logrocket.com/express-typescript-node/)
