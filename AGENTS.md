# Repository Guidelines

## Project Structure & Module Organization

- `app/src/`: React, TypeScript, Vite, and Tailwind frontend; pages sit at the root, with reusable `components/`, `hooks/`, and `types/`.
- `api/src/`: Express backend organized into `routes/`, `controllers/`, `middlewares/`, `config/`, and `utils/`. `server.ts` starts the API; `worker.ts` runs BullMQ scraping jobs; `mcp.ts` starts the MCP server, which exposes the assistant's tools (`ai/`).
- `api/prisma/schema.prisma`: database schema, with versioned migrations in `api/prisma/migrations/`; `api/src/__tests__/`: backend tests.
- `docker/` and `docker-compose.yml`: container definitions and PostgreSQL/Redis services. `assets/images/` contains README screenshots.

## Build, Test, and Development Commands

Install dependencies separately in the root, `app/` and `api/`; these are separate packages. CI uses `npm ci --legacy-peer-deps` for the API and `npm ci` for the frontend.

- `docker compose up -d database redis`: start local backing services.
- `npm run dev`: run the API, worker, and Vite frontend concurrently.
- `npm run lint`: lint the API and frontend with ESLint.
- `npm --prefix api test`: run backend Vitest tests; use `npm --prefix api run test:watch` during development.
- `cd api && npx prisma generate`: generate the API database client; `npm --prefix api run migrate`: apply the database migrations.
- `npm --prefix api run build` and `npm --prefix app run build`: compile backend and frontend.

The root `npm run build` currently invokes an undefined API `prod` script; use the explicit builds above.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, and existing file-local quote and semicolon conventions. Use PascalCase for React components, `useSomething` for hooks, and camelCase for functions and variables. Follow backend names such as `documentController.ts` and `documentRoutes.ts`. Respect ESLint, React Hooks rules, and strict TypeScript settings. No Prettier configuration is checked in.

## Testing Guidelines

Add behavior-focused Vitest tests as `api/src/__tests__/<feature>.test.ts`, using `describe`, `it`, and `expect`. Mock external dependencies when appropriate. No coverage threshold or frontend/MCP test runner is configured. Run relevant builds and lint alongside backend tests; manually verify UI changes.

## Commit & Pull Request Guidelines

Follow history's `feat: <summary>` and `fix: <summary>` convention. Keep commits focused. PRs should explain behavior changes, link relevant issues, record validation commands, and include screenshots for UI changes. CI checks API/frontend lint, backend tests, builds, and Knip dependency reports.

## Configuration

Use `api/.env.example` as the configuration reference. Keep credentials and tokens out of commits. Change the database with `npm --prefix api run migrate:dev -- --name <change>`, review the generated SQL in `api/prisma/migrations/`, and commit it; `npm --prefix api run migrate` applies pending migrations (the API container does it at startup).
