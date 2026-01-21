# Tritou Notes

Application de prise note en ligne perso (un siteweb) avec récupération de données en ligne.

Il faut faire :

- scraper pour récupérer automatiquement des infos sur un site (pour faire de la veille)
- clés api mistral pour ce qui est ia (simplifier du contenu, rechercher rapidement un mot, ...)

TODO modèle :

- [x] user
- [ ] scraper
- [ ] document

TODO controller :

- [x] userController
- [ ] scraperController
- [ ] documentController

TODO routes :

- [x] userRoutes
- [ ] scraperRoutes
- [ ] documentRoutes

TODO middleware :

- [ ] authMiddleware

TODO config :

- [ ] mistralClient
- [ ] crons

TODO utils :

- [ ] jwtConfig

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

### Technos

- TypeScript
- Express
- Dotenv
- Eslint
- Prettier

### Structure

```
tritou-notes/
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
