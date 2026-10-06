# Tritou Notes

Tritou Notes is a personal, self-hosted application for taking notes and collecting information from the web. Its features include:

- Text documents, Excel-style spreadsheets, and to-do lists.
- Online data collection through programmable scrapers.
- AI-assisted writing and document editing.

## Application Preview

### Login Page

![Login page](/assets/images/page-connexion.png)

### Documents Page

This page lists your documents. Three document types are available:

- Text documents: a blank page with Markdown support.
- Spreadsheets: Excel-style tables for organizing data.
- To-do lists: structured task lists.

![Documents page](/assets/images/page-docs.png)

### Document Editor

![Document editor](/assets/images/page-doc.png)

### Scrapers Page

Create scrapers and use them with schedulers to refresh document content from selected web pages at regular intervals.

![Scrapers page](/assets/images/page-scrapers.png)

### Scraper Configuration

Specify the base URLs a scraper should handle, then write custom scraping code for each website.

![Scraper configuration](/assets/images/page-config-scraper.png)

### Instances Page

Run scrapers against individual URLs to test their output.

![Instances page](/assets/images/page-instances.png)

### Schedulers Page

Schedule recurring scraping jobs and store their results in the database.

![Schedulers page](/assets/images/page-planificateurs.png)

### Scheduler Configuration

![Scheduler configuration](/assets/images/page-config-planificateur.png)

### User Management

Public registration is disabled because this application is intended for personal, self-hosted use, including deployment on a VPS.

Administrators can invite additional users by email and manage their permissions.

![User management](/assets/images/page-users.png)

### User Permissions

Administrators can choose which actions each user is allowed to perform. By default, users can view documents.

![User permissions](/assets/images/page-config-user.png)

## Repository Structure

```text
tritou-notes/
├── app/                    # React frontend
├── api/                    # Express backend and scraping worker
├── mcp/                    # MCP server
├── docker/
│   ├── api/Dockerfile      # Backend container
│   ├── app/Dockerfile      # Frontend container
│   ├── worker/Dockerfile   # Scraping worker container
│   ├── mcp/Dockerfile      # MCP server container
│   └── database/docker-compose.yml # Development PostgreSQL and Redis services
├── docker-compose.yml     # Application services
├── docs/                   # Architecture diagrams and documentation
├── assets/images/         # README screenshots
└── README.md
```

### Application Pages

- **Documents:** create and manage text documents, spreadsheets, and to-do lists.
- **Scrapers:** administrator page for creating and managing scrapers.
- **Instances:** administrator page for running scrapers against specific URLs.
- **Schedulers:** administrator page for scheduling scraping jobs.
- **Users:** administrator page for listing users and inviting new accounts.

## Frontend

### Technologies

- TypeScript
- React
- Tailwind CSS
- ESLint
- Vite

## Backend

### Prisma

Run these commands from the `api/` directory.

Synchronize the database with the schema. Review schema changes first, especially when working with an existing database:

```sh
npx prisma db push
```

Generate the Prisma client:

```sh
npx prisma generate
```

### Technologies

- TypeScript
- Express
- Prisma
- PostgreSQL
- Redis and BullMQ
- dotenv
- ESLint

### Structure

```text
api/
├── prisma/
│   └── schema.prisma       # Database schema
├── src/
│   ├── config/             # Environment variables and service clients
│   ├── controllers/        # Request handling and application logic
│   ├── middlewares/        # Authentication, permissions, and error handling
│   ├── routes/             # Express routes
│   ├── utils/              # Shared helpers and storage utilities
│   ├── types/              # TypeScript declarations
│   ├── __tests__/          # Backend tests
│   ├── app.ts              # Express application configuration
│   ├── server.ts           # API entry point
│   └── worker.ts           # Scraping queue worker
├── .env.example            # Environment configuration reference
├── package.json            # Scripts and dependencies
└── tsconfig.json           # TypeScript configuration
```

### Backend Tests

```sh
cd api/
npm run test
```

See [backend testing documentation](docs/tests-backend.md) for coverage and integration tests.

### Run CI Locally

Install `act` on macOS:

```sh
brew install act
```

Run the GitHub Actions workflows locally:

```sh
act
```

To use an amd64 container architecture:

```sh
act --container-architecture linux/amd64
```
