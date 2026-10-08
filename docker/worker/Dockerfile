# Build: compile TypeScript and the Cheerio bundle for the scraper sandbox.
FROM node:24-alpine AS build
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY api/package*.json ./
RUN npm ci --legacy-peer-deps
COPY api .
RUN npx prisma generate && npm run build

# Runtime: production dependencies and Debian's Chromium, run as the unprivileged `node` user.
# Debian (glibc), not Alpine: Chromium's own seccomp policy kills renderers on musl's syscalls,
# so its sandbox only works here (see docker/worker/seccomp-chromium.json).
FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-freefont-ttf ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production
COPY api/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=build /api/dist ./dist
COPY --from=build /api/sandbox ./sandbox

USER node
CMD ["node", "dist/worker.js"]
