# Tritou Notes — MCP Server

Serveur [MCP (Model Context Protocol)](https://modelcontextprotocol.io) qui expose les données de Tritou Notes à Claude.  
Claude peut ainsi lire et modifier les documents, scrapers, instances, planificateurs et utilisateurs directement depuis une conversation.

## Outils disponibles (22)

| Domaine        | Outils                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Documents      | `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`      |
| Scrapers       | `list_scrapers`, `get_scraper`, `create_scraper`, `update_scraper`, `delete_scraper`           |
| Instances      | `list_instances`, `get_instance`, `run_scrape`, `delete_instance`                              |
| Planificateurs | `list_schedulers`, `get_scheduler`, `create_scheduler`, `update_scheduler`, `delete_scheduler` |
| Utilisateurs   | `list_users`, `get_user`                                                                       |
| Éditeur        | `list_slash_commands`                                                                          |

## Prérequis

- Node.js 20+
- L'API (`api/`) doit partager la même base PostgreSQL et le même Redis
- Le worker (`api/src/worker.ts`) doit tourner pour que `run_scrape` exécute réellement le scrape

## Installation

```bash
cd mcp
npm install
npm run build
```

`npm run build` fait deux choses dans l'ordre :

1. `prisma generate` — génère le client TypeScript dans `src/generated/prisma/` à partir du schéma
2. `tsc` — compile tout le TypeScript vers `dist/`

## Deux modes de fonctionnement

Le serveur démarre en mode **stdio** (local) ou **HTTP** (production) selon la variable `MCP_HTTP_PORT`.

| Variable                    | Rôle                                                    |
| --------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`              | Connexion PostgreSQL                                    |
| `REDIS_HOST` / `REDIS_PORT` | Connexion Redis                                         |
| `MCP_HTTP_PORT`             | Si défini → mode HTTP sur ce port. Absent → mode stdio. |
| `MCP_AUTH_TOKEN`            | Token Bearer obligatoire en mode HTTP                   |

---

## Mode local (stdio) — Claude Desktop sur la même machine que la DB

Crée `mcp/.env` (copie `.env.example`) avec tes valeurs, puis ouvre  
`~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "tritou-notes": {
      "command": "node",
      "args": ["/chemin/absolu/vers/tritou-notes/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/tritou_notes",
        "REDIS_HOST": "127.0.0.1",
        "REDIS_PORT": "6379"
      }
    }
  }
}
```

Redémarre Claude Desktop.

---

## Mode production (HTTP) — DB sur un serveur distant

### 1. Déployer le service MCP sur le serveur

Ajoute `MCP_AUTH_TOKEN` dans un fichier `.env` à la racine du projet (même que les autres services) :

```env
MCP_AUTH_TOKEN=un_secret_long_et_aleatoire
```

Puis lance le service avec Docker Compose ou le Dockerfile.

Le MCP tourne sur le port **3001** à l'intérieur du réseau Docker.

### 2. Exposer via nginx (HTTPS obligatoire)

Ajoute un bloc dans ta config nginx sur le serveur :

```nginx
location /mcp {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_cache off;
}
```

Le `/health` ne nécessite pas de token : `https://ton-domaine.com/mcp/health` doit répondre `{"ok":true}`.

### 3. Configurer Claude Desktop

Claude Desktop ne supporte pas encore le format `url` natif — il faut passer par `mcp-remote`, un proxy stdio qui fait le lien avec le serveur HTTP. Il sera téléchargé automatiquement via `npx`.

Dans `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "tritou-notes": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://ton-domaine.com/mcp",
        "--header",
        "Authorization: Bearer un_secret_long_et_aleatoire"
      ]
    }
  }
}
```

Redémarre Claude Desktop.

## Après un changement de schéma Prisma

Si tu modifies `api/prisma/schema.prisma`, répercute les changements dans `mcp/prisma/schema.prisma` puis régénère le client :

```bash
cd mcp
npm run db:generate
npm run build
```
