# ── Build aşaması ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Çalışma aşaması (slim) ─────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Yedekleme/geri yükleme pg_dump ve psql ister. Sürüm, docker-compose'daki
# PostgreSQL 16 sunucusuyla eşleşmeli (pg_dump sunucudan eskiyse reddeder).
RUN apk add --no-cache postgresql16-client
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Stateless: her replika bağımsız çalışır.
EXPOSE 3000
CMD ["node", "dist/main.js"]
