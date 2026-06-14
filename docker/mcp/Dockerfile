FROM node:20-alpine

WORKDIR /mcp

COPY mcp/package*.json ./
RUN npm install

COPY mcp .

RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
