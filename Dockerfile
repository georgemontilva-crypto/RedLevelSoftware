# Imagen de la WEB de Red Level (carpeta web/), para desplegar en Railway sin tocar el Root Directory.
# El programa de Windows no se compila aquí: eso lo hace GitHub Actions (.github/workflows/build.yml).

FROM node:22-slim AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
CMD ["node", "dist-server/index.js"]
