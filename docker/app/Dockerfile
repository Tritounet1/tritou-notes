# Stage 1: build
FROM node:20-alpine AS builder

# Build argument for API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

COPY app/package*.json ./
RUN npm install

COPY app .

# Debug: show the API URL during build
RUN echo "Building with VITE_API_URL=$VITE_API_URL"

RUN npm run build

# Debug: verify the URL is in the built files
RUN grep -r "localhost:3000" dist/ || echo "localhost:3000 NOT found in build (good!)"
RUN grep -r "api.notes.tritounet" dist/ || echo "api.notes.tritounet NOT found in build (bad!)"

# Stage 2: serve with nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/app/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
