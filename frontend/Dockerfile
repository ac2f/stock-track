# ── Build aşaması ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# Kararsız ağda npm kısa kopmalarda pes etmesin; indirilenler önbellekte kalır
# (kurulum yarıda kesilirse yeniden denemede kaldığı yerden devam eder).
ENV NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# VITE_API_URL derleme zamanında gömülür. BOŞ bırakılırsa üretim derlemesi aynı kaynaktaki '/api/v1'
# yolunu kullanır (nginx onu api servisine yönlendirir: CORS/port sorunu yok). API ayrı bir adreste
# ise build-arg ile tam adresi verin ve nginx'teki CSP connect-src'e o adresi ekleyin.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Çalışma aşaması (statik sunum: nginx) ──────────────────
FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
