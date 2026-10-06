# Stage 1: build
FROM node:20-alpine

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

EXPOSE 3000

# Run database sync then start the server
CMD sh -c "npx prisma db push --accept-data-loss && npm run start:api"
