# Tritou Notes

A self-hosted workspace for writing notes and pulling data from the web into them — with an AI assistant that can read and edit your pages.

- **Pages** — Markdown documents, spreadsheets and to-do lists, organised as a tree of sub-pages, with version history, code blocks, web-link previews and images.
- **Scraping** — write small scrapers in JavaScript, run them on demand or on a cron schedule, and embed their live results in any page.
- **AI assistant** — chat with any model available on [OpenRouter](https://openrouter.ai): it can search, read, create and edit pages, to-dos and spreadsheets, and accepts images, PDFs and text files. `/image-ia` generates images straight into a page.
- **MCP server** — let Claude (Code or Desktop) work with your notes and scrapers.
- **Private by design** — no public sign-up: an administrator invites users and chooses what each of them may do.

## Preview

| | |
|---|---|
| ![Documents](/assets/images/page-docs.png) | ![Document editor](/assets/images/page-doc.png) |
| **Documents** — pages, spreadsheets and to-do lists | **Editor** — Markdown with slash commands (`/page`, `/code`, `/planificateur`…) |
| ![Scraper configuration](/assets/images/page-config-scraper.png) | ![Schedulers](/assets/images/page-planificateurs.png) |
| **Scrapers** — base URLs and scraping code, with autocompletion | **Schedulers** — recurring scrapes with cron expressions |
| ![Instances](/assets/images/page-instances.png) | ![User permissions](/assets/images/page-config-user.png) |
| **Instances** — test a scraper on a URL | **Users** — invitations and per-user permissions |

## How it works

```text
React app ──► Express API ──► PostgreSQL (Prisma)
                  │
                  ├──► Redis / BullMQ ──► Worker (Puppeteer + Cheerio) ──► websites
                  ├──► OpenRouter (assistant, image generation)
                  └──► Local disk (document images)

MCP server ──► PostgreSQL + Redis (same data, used by Claude)
```

A scraper is a piece of synchronous JavaScript that receives `$` (Cheerio loaded with the page HTML) and assigns `result`. The worker picks the active scraper whose base URLs contain the page's origin:

```js
result = {
  title: $("h1").first().text().trim(),
  prices: $(".price").map((i, el) => $(el).text()).get(),
};
```

## Getting started (development)

Requirements: Node.js 20+, Docker (for PostgreSQL and Redis).

```sh
# 1. Backing services
docker compose up -d database redis

# 2. Dependencies — each folder is its own package
npm install && (cd api && npm install) && (cd app && npm install)

# 3. API configuration
cp api/.env.example api/.env
```

Fill in `api/.env` (see [Configuration](#configuration)); for the Docker services above:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/default_database
SECRET_JTW_KEY=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
```

```sh
# 4. Create the database schema, then start the API, the worker and the app
(cd api && npm run sync-database)
npm run dev
```

The app runs on <http://localhost:5173>, the API on <http://localhost:3000>.

### First administrator

While no administrator exists, the API prints a one-time link at startup:

```text
admin auth page : http://localhost:5173/admin-auth?code=…
```

Open it to create the administrator account. Other users join through email invitations (**Users** page), which requires SMTP settings (**Settings › E-mail**).

### AI assistant

In **Settings › Intelligence artificielle**, paste an [OpenRouter API key](https://openrouter.ai/keys) and pick a text model (any model with tool calling) and an image model. The key is stored encrypted and never sent back to the browser. Users need the *AI chat* permission.

## Configuration

`api/.env` (also read by the Docker services):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_JTW_KEY` | Secret used to sign session tokens |
| `ENCRYPTION_KEY` | 32-byte hex key encrypting stored secrets (OpenRouter key, SMTP). **Don't change it** once secrets are saved. |
| `FRONTEND_URL` | App URL, used for CORS and invitation links (default `http://localhost:5173`) |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Redis for the scraping queue (default `127.0.0.1:6379`) |
| `IMAGE_STORAGE_PATH` | Where uploaded and generated document images are stored (default `./uploads/images`) |
| `PORT`, `NODE_ENV` | API port (default `3000`) and environment |

The app reads `VITE_API_URL` at build time (default `http://localhost:3000`).

## Deployment

`docker-compose.yml` runs every service: `database`, `redis`, `api`, `worker`, `mcp` and `app` (nginx).

```sh
VITE_API_URL=https://api.example.com docker compose up -d --build
```

- Set `FRONTEND_URL` in `api/.env` to the public app URL.
- Document images live in the `document-images` volume: include it in your backups along with PostgreSQL.
- On startup the API container applies the Prisma schema (`npm run sync-database`). It **refuses changes that would drop data**: review them, then apply once with `npx prisma db push --accept-data-loss` if they are expected.
- Behind nginx, keep response buffering off for the API so assistant replies stream (the API already sends `X-Accel-Buffering: no`).

### MCP server

The MCP server exposes pages, scrapers, instances, schedulers and users to Claude. In HTTP mode it only accepts the bearer token generated in **Settings › MCP**, which also shows ready-to-copy Claude Code and Claude Desktop configurations. See [mcp/README.md](mcp/README.md).

## Repository structure

```text
tritou-notes/
├── app/                 # React + Vite + Tailwind frontend
├── api/                 # Express API and scraping worker
│   ├── prisma/          # Database schema
│   └── src/
│       ├── ai/          # OpenRouter client, assistant loop and tools
│       ├── controllers/ # Request handling
│       ├── routes/      # Express routers
│       ├── middlewares/ # Auth, admin and permission checks
│       ├── utils/       # Shared helpers (page tree, revisions, storage…)
│       ├── __tests__/   # Vitest suites
│       ├── server.ts    # API entry point
│       └── worker.ts    # Scraping queue consumer
├── mcp/                 # MCP server (stdio and HTTP)
├── docker/              # Dockerfiles for api, worker, app and mcp
├── docs/                # Architecture diagrams and test documentation
└── docker-compose.yml
```

## Development

```sh
npm run lint              # ESLint for the API and the app
npm --prefix api test     # Backend tests (Vitest)
npm --prefix app run build
npm --prefix mcp run build
```

Changes to `api/prisma/schema.prisma` must be mirrored in `mcp/prisma/schema.prisma`. CI (GitHub Actions) runs lint, tests and builds; run it locally with [`act`](https://github.com/nektos/act) (`act --container-architecture linux/amd64` on Apple Silicon).

More details: [architecture diagrams](docs/schemas) and [backend tests](docs/tests-backend.md).
