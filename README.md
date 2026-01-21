# Personal Notes App

Application de prise note en ligne perso (un siteweb) avec récupération de données en ligne.

Il faut faire :

- lier à une base de données postgresql pour stocker les données
- scraper pour récupérer automatiquement des infos sur un site (pour faire de la veille)
- clés api mistral pour ce qui est ia (simplifier du contenu, rechercher rapidement un mot, ...)

TODO modèle :

- [ ] user
- [ ] scraper
- [ ] document

TODO controller :

- [ ] userController
- [ ] scraperController
- [ ] documentController

TODO routes :

- [ ] userRoutes
- [ ] scraperRoutes
- [ ] documentRoutes

TODO middleware :

- [ ] authMiddleware

TODO config :

- [ ] dbClient (ou client simplement)
- [ ] mistralClient
- [ ] cronConfig

TODO utils :

- [ ] jwtConfig

## api

```
ts-node-express/
├── src/
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
