# ── Build aşaması ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# Ağ kararsızsa (Docker Desktop DNS/VPN/proxy) npm kısa kopmalarda pes etmesin:
# 6 kez yeniden dener, uzun zaman aşımı kullanır.
ENV NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
COPY package*.json ./
# İndirilen paketler derleme önbelleğinde kalır: kurulum yarıda kesilirse
# yeniden denemede baştan değil, kaldığı yerden devam eder.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build
# Çalışma aşamasına yalnız üretim bağımlılıkları gider. Ağ gerekmez: ikinci bir
# `npm ci` internetten tekrar indirmek (ve tekrar takılmak) demekti.
RUN npm prune --omit=dev

# ── Çalışma aşaması (slim) ─────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Yedekleme/geri yükleme pg_dump ve psql ister. Sürüm, docker-compose'daki
# PostgreSQL 16 sunucusuyla eşleşmeli (pg_dump sunucudan eskiyse reddeder).
RUN apk add --no-cache postgresql16-client
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# PDF yazı tipi (Türkçe harfler): derleme varlık kopyalamasına ek güvence.
COPY --from=builder /app/src/modules/documents/fonts ./dist/modules/documents/fonts

# Stateless: her replika bağımsız çalışır.
EXPOSE 3000
CMD ["node", "dist/main.js"]
