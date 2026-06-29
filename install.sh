#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — TEK KOMUTLA otomatik kurulum (Linux / macOS)
#
#   ./install.sh            normal kurulum/güncelleme (veri korunur)
#   ./install.sh --reset    veritabanını SIFIRLAYIP yeniden kurar (veri SİLİNİR)
#
# Yaptıkları:
#   • Docker'ı kontrol eder.
#   • backend/.env yoksa örnekten üretir; güçlü JWT secret'ları atar.
#   • Kök .env'i (compose ↔ Postgres ↔ API aynı DB bilgisi) yazar.
#   • Tüm servisleri (Postgres + API + Web) derleyip başlatır.
#   • API'nin gerçekten hazır (DB bağlı + şema + OWNER tohumlandı) olmasını bekler.
#   • Erişim adresini ve giriş bilgilerini yazdırır.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

RESET=0
[ "${1:-}" = "--reset" ] && RESET=1

say()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

say "StockTrack ERP — otomatik kurulum başlıyor…"

# 1) Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  err "Docker bulunamadı. Kurun: https://docs.docker.com/get-docker/"; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker çalışmıyor. Docker servisini/Docker Desktop'ı başlatıp tekrar deneyin."; exit 1
fi
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
else err "docker compose bulunamadı."; exit 1; fi
ok "Docker hazır ($COMPOSE)."

PROD="$COMPOSE -f docker-compose.prod.yml"

# 2) Yardımcılar ────────────────────────────────────────────────────────────
rand() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
set_env() {
  local f="$1" k="$2" v="$3" tmp found=0; tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "$k="*) printf '%s=%s\n' "$k" "$v"; found=1 ;; *) printf '%s\n' "$line" ;; esac
  done < "$f" > "$tmp"
  [ "$found" -eq 0 ] && printf '%s=%s\n' "$k" "$v" >> "$tmp"
  mv "$tmp" "$f"
}
get_env() { grep -E "^$2=" "$1" 2>/dev/null | head -n1 | cut -d= -f2- || true; }

# 3) --reset: veritabanını sıfırla ──────────────────────────────────────────
if [ "$RESET" -eq 1 ]; then
  warn "--reset: mevcut veritabanı (volume) ve container'lar siliniyor…"
  $PROD down -v --remove-orphans >/dev/null 2>&1 || true
  ok "Eski durum temizlendi."
fi

# 4) backend/.env ───────────────────────────────────────────────────────────
# NOT: Postgres yalnızca Docker ağı içinde erişilebilir (host'a açık DEĞİL), bu
# nedenle DB parolası sabit/deterministik bırakılır — böylece kalıcı volume ile
# .env arasında parola uyuşmazlığı (bağlantı hatası) hiç oluşmaz. JWT secret'ları
# güvenlik açısından kritik olduğundan rastgele üretilir.
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  set_env backend/.env NODE_ENV production
  set_env backend/.env DB_SYNCHRONIZE true
  set_env backend/.env JWT_ACCESS_SECRET "$(rand)"
  set_env backend/.env JWT_REFRESH_SECRET "$(rand)"
  ok "backend/.env üretildi (güçlü JWT secret'ları atandı)."
else
  ok "backend/.env zaten var — korunuyor."
fi

# 5) Kök .env (compose Postgres bilgisi = backend/.env) ─────────────────────
DBPASS="$(get_env backend/.env DB_PASSWORD)";  DBPASS="${DBPASS:-stocktrack}"
DBUSER="$(get_env backend/.env DB_USERNAME)";  DBUSER="${DBUSER:-stocktrack}"
DBNAME="$(get_env backend/.env DB_NAME)";      DBNAME="${DBNAME:-stocktrack}"
{
  echo "# Docker Compose interpolation (Postgres) — backend/.env ile EŞLEŞMELİ."
  echo "DB_USERNAME=$DBUSER"
  echo "DB_PASSWORD=$DBPASS"
  echo "DB_NAME=$DBNAME"
} > .env
ok "Kök .env yazıldı (compose ↔ API eşleşmesi)."

# 6) Derle + başlat ─────────────────────────────────────────────────────────
say "İmajlar derleniyor ve servisler başlatılıyor (ilk sefer birkaç dakika sürebilir)…"
$PROD up -d --build
ok "Container'lar başlatıldı."

# 7) API hazır olana kadar bekle (DB bağlı + şema + OWNER tohumlandı) ────────
say "API'nin hazır olması bekleniyor…"
HEALTH="http://localhost:3000/api/v1/health"
READY=0
for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH" 2>/dev/null || echo 000)"
  elif command -v wget >/dev/null 2>&1; then
    code="$(wget -q -O /dev/null -S "$HEALTH" 2>&1 | awk '/HTTP\//{print $2; exit}' || echo 000)"
  else code="skip"; fi
  if [ "$code" = "200" ] || [ "$code" = "skip" ]; then READY=1; break; fi
  sleep 2
done

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "${IP:-}" ] && IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
IP="${IP:-localhost}"
OEMAIL="$(get_env backend/.env SEED_OWNER_EMAIL)";    OEMAIL="${OEMAIL:-owner@stocktrack.local}"
OPASS="$(get_env backend/.env SEED_OWNER_PASSWORD)";  OPASS="${OPASS:-Owner123!}"

if [ "$READY" -ne 1 ]; then
  err "API beklenen sürede yanıt vermedi. Son API kayıtları:"
  $PROD logs --tail=40 api || true
  cat <<EOF

İpucu: Veritabanı parolası eski bir volume ile uyuşmuyorsa (örn. daha önceki bir
kurulumdan kalan), şu komutla SIFIRLAYIP yeniden kurun (veri silinir):

  ./install.sh --reset
EOF
  exit 1
fi
ok "API hazır."

# 8) İlk hesap/varsayılanları kesinleştir (idempotent + görünür) ─────────────
say "İlk kullanıcı ve varsayılanlar kontrol ediliyor…"
$PROD run --rm api node dist/database/seed.js || warn "Tohumlama adımı uyarı verdi — yukarıdaki kayıtlara bakın."

cat <<EOF

============================================================
 Kurulum tamamlandı! 🎉
 Arayüz : http://$IP/            (bu bilgisayar: http://localhost/)
 API    : http://$IP:3000/api
 Giriş  : $OEMAIL  /  $OPASS
------------------------------------------------------------
 Durdur : $PROD down
 Başlat : $PROD up -d
 Sıfırla: ./install.sh --reset   (veritabanını siler)
============================================================
EOF
