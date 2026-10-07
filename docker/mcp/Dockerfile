# MCP server: same code as the API (the assistant's tools), started with dist/mcp.js.
FROM node:24-alpine AS build
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY api/package*.json ./
RUN npm ci --legacy-peer-deps
COPY api .
RUN npx prisma generate && npm run build

FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true NODE_ENV=production
COPY api/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=build /api/dist ./dist
RUN mkdir -p /api/uploads/images && chown node:node /api/uploads/images

EXPOSE 3001

# The API container owns the schema sync. Root only to hand the shared image volume to `node`.
CMD ["sh", "-c", "chown -R node:node /api/uploads/images && exec su-exec node node dist/mcp.js"]
