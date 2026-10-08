# Tritou Notes

A self-hosted workspace for writing notes and pulling data from the web into them — with an AI assistant that can read and edit your pages.

- **Pages** — Markdown documents, spreadsheets and to-do lists, organised in folders and as a tree of sub-pages, with version history, code blocks, web-link previews and images.
- **Scraping** — write small scrapers in JavaScript, run them on demand or on a cron schedule, and embed their live results in any page.
- **AI assistant** — chat with any model available on [OpenRouter](https://openrouter.ai): it can drive the whole app (pages, to-dos, spreadsheets, folders, scrapers, schedulers, scrape runs) within your permissions, and accepts images, PDFs and text files. `/image-ia` generates images straight into a page.
- **MCP server** — let Claude (Code or Desktop) work with your notes and scrapers.
- **Private by design** — no public sign-up: an administrator invites users and chooses what each of them may do.

## Preview

| | |
|---|---|
| ![Documents](/assets/images/page-docs.webp) | ![Document editor](/assets/images/page-doc.webp) |
| **Documents** — pages, spreadsheets and to-do lists | **Editor** — Markdown with slash commands (`/page`, `/code`, `/planificateur`…) |
| ![Scraper configuration](/assets/images/page-config-scraper.webp) | ![Schedulers](/assets/images/page-planificateurs.webp) |
| **Scrapers** — base URLs and scraping code, with autocompletion | **Schedulers** — recurring scrapes with cron expressions |
| ![Instances](/assets/images/page-instances.webp) | ![User permissions](/assets/images/page-config-user.webp) |
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
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
```

```sh
# 4. Create the database schema (versioned migrations), then start the API, the worker and the app
(cd api && npm run migrate)
npm run dev
```

The app runs on <http://localhost:5173>, the API on <http://localhost:3000>.

### First administrator

While no administrator exists, the API prints a one-time link at startup:

```text
admin auth page : http://localhost:5173/admin-auth?code=…
```

Open it to create the administrator account. Other users join through email invitations (**Users** page), which requires SMTP settings (**Settings › E-mail**). To keep the link out of the logs, set `ADMIN_BOOTSTRAP_CODE` (32+ characters) in `api/.env` and open `/admin-auth?code=<that value>` yourself.

### Access model

Tritou Notes is a **shared workspace**: every signed-in user reads every page and its history, like a team wiki. Permissions (**Users** page) control what each user may *do*: create, edit or delete pages, use the scrapers, the scraping pages or the assistant. Scrape results require access to the Instances or Scrapers pages. Pages marked public are readable without an account through their link.

### AI assistant

In **Settings › Intelligence artificielle**, paste an [OpenRouter API key](https://openrouter.ai/keys) and pick a text model (any model with tool calling) and an image model. The key is stored encrypted and never sent back to the browser. Users need the *AI chat* permission.

## Configuration

`api/.env` (also read by the Docker services):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign session tokens (the former name `SECRET_JTW_KEY` is still read). The API, worker and MCP refuse to start with a missing database URL, JWT secret or malformed `ENCRYPTION_KEY` |
| `ENCRYPTION_KEY` | 32-byte hex key encrypting stored secrets (OpenRouter key, SMTP). **Don't change it** once secrets are saved. |
| `FRONTEND_URL` | App URL, used for CORS and invitation links (default `http://localhost:5173`) |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Redis for the scraping queue (default `127.0.0.1:6379`) |
| `IMAGE_STORAGE_PATH` | Where uploaded and generated document images are stored (default `./uploads/images`) |
| `PORT`, `NODE_ENV` | API port (default `3000`) and environment |
| `ADMIN_BOOTSTRAP_CODE` | Optional, 32+ characters: code of the first-administrator link, which is then not written to the logs |

The app reads `VITE_API_URL` at build time (default `http://localhost:3000`).

## Deployment

`docker-compose.yml` runs every service: `database`, `redis`, `api`, `worker`, `mcp` and `app` (nginx).

```sh
VITE_API_URL=https://api.example.com docker compose up -d --build
```

- Set `FRONTEND_URL` in `api/.env` to the public app URL.
- Document images live in the `document-images` volume: include it in your backups along with PostgreSQL.
- On startup the API container applies pending migrations from `api/prisma/migrations` (`npm run migrate`). A database created earlier with `prisma db push` is detected and baselined automatically on `0_init`. To change the schema: `npm --prefix api run migrate:dev -- --name <change>`, review the SQL, commit it.
- Behind nginx, keep response buffering off for the API so assistant replies stream (the API already sends `X-Accel-Buffering: no`).
- Images use Node 24 and run as the unprivileged `node` user; the worker also drops every Linux capability. The API and MCP containers start as root only to hand the `document-images` volume to `node`.
- PostgreSQL, Redis and the MCP server are published on `127.0.0.1` only: reach them through the reverse proxy (or the Docker network).
- Session cookies are `Secure` and `SameSite=Strict` when `FRONTEND_URL` is https, and last as long as the session (2 days). Changing a password signs out every other session.

### MCP server

The MCP server (`api/src/mcp.ts`) gives Claude the in-app assistant's tools: pages, folders, to-dos, spreadsheets, scrapers, schedulers and instances, with the same validation, page history and permissions. It acts as the admin who generated its token.

- **Token**: generate it in **Settings › MCP** (shown once, only its SHA-256 is stored). The page also shows ready-to-copy Claude Code and Claude Desktop configurations. Regenerating replaces it, revoking cuts access. A token generated before the MCP server moved into the API is not tied to a user and must be regenerated.
- **HTTP** (production): `MCP_HTTP_PORT=3001 npm --prefix api run start:mcp`, or the `mcp` Compose service. Proxy `/mcp` on the app's domain with buffering off; `/mcp/health` answers without a token.

  ```nginx
  location /mcp {
      proxy_pass http://localhost:3001;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
  }
  ```

- **stdio** (local): `node api/dist/mcp.js` with the API's `.env`; it acts as the token's user, so generate a token first.

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
│       ├── mcp/         # MCP server (assistant tools over MCP)
│       ├── scraping/    # Scraper sandbox and network guard
│       ├── server.ts    # API entry point
│       ├── worker.ts    # Scraping queue consumer
│       └── mcp.ts       # MCP server entry point
├── docker/              # Dockerfiles for api, worker, app and mcp
├── docs/                # Architecture diagrams and test documentation
└── docker-compose.yml
```

## Development

```sh
npm run lint              # ESLint for the API and the app
npm --prefix api test     # Backend tests (Vitest)
npm --prefix app run build
```

CI (GitHub Actions) runs lint, tests and builds; run it locally with [`act`](https://github.com/nektos/act) (`act --container-architecture linux/amd64` on Apple Silicon).

More details: [architecture diagrams](docs/schemas) and [backend tests](docs/tests-backend.md).
