# ── Build aşaması ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL derleme zamanında gömülür. BOŞ bırakılırsa istemci, arayüze
# hangi host üzerinden erişiliyorsa backend'i de o host'un 3000 portunda varsayar
# (yerel ağ için pratik). Sabit bir adres istiyorsanız build-arg ile geçin.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Çalışma aşaması (statik sunum: nginx) ──────────────────
FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
