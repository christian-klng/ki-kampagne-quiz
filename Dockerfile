# Quiz „Die KI-Kampagne“ für Coolify: Build Pack „Dockerfile“, Port 3000
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 CACHE_DIR=/app/cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs ./
COPY lib ./lib
COPY data ./data
COPY public ./public

# Live-Bilder landen in /app/cache – in Coolify als persistentes Volume einhängen
RUN mkdir -p /app/cache && chown node:node /app/cache
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.mjs"]
