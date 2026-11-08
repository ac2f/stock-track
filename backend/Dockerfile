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
# - postgresql16-client: yedekleme/geri yükleme pg_dump ve psql ister. Sürüm, docker-compose'daki
#   PostgreSQL 16 sunucusuyla eşleşmeli (pg_dump sunucudan eskiyse reddeder).
# - tini: PID 1 olarak sinyalleri (docker stop → SIGTERM) iletir ve zombi süreçleri toplar; Node PID 1
#   olursa SIGTERM'i yok sayıp 10 sn sonra SIGKILL ile öldürülürdü (yarım kalan işlem, açık bağlantı).
# - su-exec: giriş betiği, yedek birimini düzeltip yetkiyi root'tan "node" kullanıcısına indirir.
RUN apk add --no-cache postgresql16-client tini su-exec
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# PDF yazı tipi (Türkçe harfler): derleme varlık kopyalamasına ek güvence.
COPY --from=builder /app/src/modules/documents/fonts ./dist/modules/documents/fonts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Yedek klasörü kalıcı birime bağlanır (docker-compose: api_backups → /app/backups); uygulama root DEĞİL,
# "node" kullanıcısıyla çalışır. Giriş betiği, eski kurulumlardan kalma root sahipli birimi de düzeltir.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/backups && chown -R node:node /app/backups

# Stateless: her replika bağımsız çalışır.
EXPOSE 3000
# Veritabanına ulaşılamazsa sağlık 503 döner (bkz. health.controller.ts) → konteyner "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${APP_PORT:-3000}/${APP_GLOBAL_PREFIX:-api}/v1/health" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
