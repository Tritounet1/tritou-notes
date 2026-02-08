# Worker Dockerfile with Puppeteer support
FROM node:20-alpine

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chrome - we'll use the installed package
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /api

# Install dependencies first for caching
COPY api/package*.json ./
RUN npm install

# Copy app
COPY api .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Run the worker
CMD ["npm", "run", "start:worker"]
