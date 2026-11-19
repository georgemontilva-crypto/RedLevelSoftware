# Imagen de la web de Red Level. Railway la usa cuando el Root Directory del servicio es "web".
# (Si el Root Directory está vacío, usa el Dockerfile de la raíz del repo, que hace lo mismo.)

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
CMD ["node", "dist-server/index.js"]
