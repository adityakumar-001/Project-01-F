FROM node:20-alpine AS web

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend && npm cache clean --force

COPY frontend ./frontend
RUN npm run build --prefix frontend


FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --omit=dev --prefix backend && npm cache clean --force

COPY backend/server.js ./backend/server.js
COPY --from=web /app/frontend/dist ./frontend/dist

EXPOSE 3000

USER node

CMD ["node", "backend/server.js"]
