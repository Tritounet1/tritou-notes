# Build: compile TypeScript (and generate the Prisma client) with every dependency.
FROM node:24-alpine AS build
WORKDIR /api
# The API never launches a browser: skip Puppeteer's Chrome download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY api/package*.json ./
RUN npm ci --legacy-peer-deps
COPY api .
RUN npx prisma generate && npm run build

# Runtime. Keeps the Prisma CLI (a dev dependency) to apply migrations at startup.
FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY api/package*.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force
COPY api/prisma ./prisma
COPY api/prisma.config.ts ./
COPY api/scripts/migrate.mjs ./scripts/
COPY api/public ./public
COPY --from=build /api/dist ./dist
RUN mkdir -p /api/uploads/images && chown node:node /api/uploads/images
ENV NODE_ENV=production

EXPOSE 3000

# Starts as root only to hand the image volume (files written by older root containers)
# to the `node` user, then runs everything as `node`.
CMD ["sh", "-c", "chown -R node:node /api/uploads/images && exec su-exec node sh -c 'node scripts/migrate.mjs && exec node dist/server.js'"]
