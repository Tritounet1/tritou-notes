# Stage 1: build
FROM node:20-alpine

WORKDIR /api

# Install dependencies first for caching
COPY api/package*.json ./
RUN npm install

# Copy app
COPY api .

# Build TypeScript
RUN npm run build

EXPOSE 3000

# Run database sync then start the server
CMD sh -c "npm run sync-database && npm run start"
