# Build: compile TypeScript and the Cheerio bundle for the scraper sandbox.
FROM node:24-alpine AS build
WORKDIR /api
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY api/package*.json ./
RUN npm ci --legacy-peer-deps
COPY api .
RUN npx prisma generate && npm run build

# Runtime: production dependencies and Alpine's Chromium, run as the unprivileged `node` user.
FROM node:24-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
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
