# syntax=docker/dockerfile:1

# ---------- build: dépendances exactes du lockfile, compilation TypeScript ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime: image minimale, utilisateur non-root ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
# Cloud Run injecte PORT (8080 par défaut)
EXPOSE 8080
CMD ["node", "dist/main.js"]
