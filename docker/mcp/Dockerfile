# MCP server: same code as the API (the assistant's tools), started with dist/mcp.js
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

EXPOSE 3001

# The API container owns the schema sync; the MCP server only uses it.
CMD ["npm", "run", "start:mcp"]
