# Tritou Notes

Tritou Notes est une application très personnel (donc sur mes envies), de prise de notes et de veille, l'application regroupe plusieurs fonctionnalités dont :

- Création de note simple (style word classique), de tableau excel et de liste TODO.
- Récupération de données en ligne, avec des scrapers programmables.
- Intégration de l'ia pour l'écriture / modification des documents.

## Visual sur l'application

### Page de connexion :

![Page de connexion](/assets/images/page-connexion.png)

### Page des documents :

La page qui liste les différents documents créent, il y a trois documents différents :

- Classique, une page blanche ou on peut écrire en Markdown.
- Classeur style excel, pour avoir un tableau de données.
- ToDo List qui permet de créer une ToDo List propre.

![Page des documents](/assets/images/page-docs.png)

### Page de modification d'un document :

![Page de modification d'un document](/assets/images/page-doc.png)

### Page des scrapers :

On peut créent des scrapers pour ensuite les utilisés dans les documents avec les planificateurs qui permettent de configurer on scrape tout les combien de temps des pages séléctionnés, cela permet d'agréer des pages de document avec des données non statique.

![Page des scrapers](/assets/images/page-scrapers.png)

### Page de configuration d'un scraper :

La page de configuration d'un scraper permet donc d'écrire sur quel url il faut utiliser ce scraper (URLs de base), ensuite il faut
écrire un code personnalisé pour chaque scraper car chaque site sont différents.

![Page de configuration d'un scraper](/assets/images/page-config-scraper.png)

### Page des instances :

La page des instances permet de tester les scrapers.

![Page des instances](/assets/images/page-instances.png)

### Page des planificateurs :

Les planificateurs permettent donc de scrapés des pages tout les x temps pour ensuite les stockés en base de données.

![Page des planificateurs](/assets/images/page-planificateurs.png)

### Page de configuration d'un planificateur :

![Page de configuration d'un planificateur](/assets/images/page-config-planificateur.png)

### Page de gestion des users :

L'application ne permet pas de s'enregistrer, ce qui est normal, car c'est une application auto-hébergée personnelle (que n'importe qui peut configurer sur un VPS). Le but est donc d'avoir sa propre application de prise de notes en ligne.

On peut cependant ajouter d'autres utilisateurs en les invitant par mail à créer leur compte. Seul l'administrateur peut inviter d'autres utilisateurs.

Et un administrateur peut aussi gérer les permisions des utilisateurs.

![Page de gestion des users](/assets/images/page-users.png)

### Page de gestion des permissions d'un user :

Un administrateur peut modifier tout les droits d'un user pour séléctionner ce qu'il a le droit de faire, par défaut il peut visualiser les documents.

![Page de gestion des permissions d'un user](/assets/images/page-config-user.png)

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

### Run backend test

```sh
cd api/
npm run test
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
