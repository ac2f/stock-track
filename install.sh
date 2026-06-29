#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — TEK KOMUTLA otomatik kurulum (Linux / macOS)
#
#   ./install.sh
#
# Yaptıkları:
#   • Docker'ı kontrol eder.
#   • backend/.env yoksa örnekten üretir; güçlü JWT secret'ları + DB parolası atar.
#   • Kök .env'i (compose ↔ Postgres parola eşleşmesi) yazar.
#   • Tüm servisleri (Postgres + API + Web) derleyip başlatır.
#   • Açılışta OWNER hesabı otomatik oluşur (idempotent) → ayrıca seed gerekmez.
#   • Erişim adresini ve giriş bilgilerini yazdırır.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

say "StockTrack ERP — otomatik kurulum başlıyor…"

# 1) Docker kontrolü ────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  err "Docker bulunamadı. Kurun: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker çalışmıyor. Docker servisini/Docker Desktop'ı başlatıp tekrar deneyin."
  exit 1
fi
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  err "docker compose bulunamadı (Docker Compose eklentisi gerekli)."
  exit 1
fi
ok "Docker hazır ($COMPOSE)."

# 2) Yardımcılar ────────────────────────────────────────────────────────────
rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}
# set_env <dosya> <anahtar> <değer> — varsa değiştirir, yoksa ekler (UTF-8 korunur)
set_env() {
  local f="$1" k="$2" v="$3" tmp found=0
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$k="*) printf '%s=%s\n' "$k" "$v"; found=1 ;;
      *)      printf '%s\n' "$line" ;;
    esac
  done < "$f" > "$tmp"
  [ "$found" -eq 0 ] && printf '%s=%s\n' "$k" "$v" >> "$tmp"
  mv "$tmp" "$f"
}
get_env() { grep -E "^$2=" "$1" 2>/dev/null | head -n1 | cut -d= -f2- || true; }

# 3) backend/.env ───────────────────────────────────────────────────────────
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  set_env backend/.env NODE_ENV production
  set_env backend/.env DB_SYNCHRONIZE true
  set_env backend/.env JWT_ACCESS_SECRET "$(rand)"
  set_env backend/.env JWT_REFRESH_SECRET "$(rand)"
  set_env backend/.env DB_PASSWORD "$(rand | cut -c1-24)"
  ok "backend/.env üretildi (güçlü secret'lar atandı)."
else
  ok "backend/.env zaten var — korunuyor."
fi

# 4) Kök .env (compose'un Postgres'i ile aynı parola) ───────────────────────
DBPASS="$(get_env backend/.env DB_PASSWORD)";  DBPASS="${DBPASS:-stocktrack}"
DBUSER="$(get_env backend/.env DB_USERNAME)";  DBUSER="${DBUSER:-stocktrack}"
DBNAME="$(get_env backend/.env DB_NAME)";      DBNAME="${DBNAME:-stocktrack}"
{
  echo "# Docker Compose interpolation (Postgres) — backend/.env ile EŞLEŞMELİ."
  echo "DB_USERNAME=$DBUSER"
  echo "DB_PASSWORD=$DBPASS"
  echo "DB_NAME=$DBNAME"
} > .env
ok "Kök .env yazıldı (compose ↔ API parola eşleşmesi)."

# 5) Derle + başlat ─────────────────────────────────────────────────────────
say "İmajlar derleniyor ve servisler başlatılıyor (ilk sefer birkaç dakika sürebilir)…"
$COMPOSE -f docker-compose.prod.yml up -d --build
ok "Servisler ayakta."

# 6) Erişim bilgisi ─────────────────────────────────────────────────────────
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "${IP:-}" ] && IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
IP="${IP:-localhost}"
OEMAIL="$(get_env backend/.env SEED_OWNER_EMAIL)";    OEMAIL="${OEMAIL:-owner@stocktrack.local}"
OPASS="$(get_env backend/.env SEED_OWNER_PASSWORD)";  OPASS="${OPASS:-Owner123!}"

cat <<EOF

============================================================
 Kurulum tamamlandı! 🎉
 Arayüz : http://$IP/            (bu bilgisayar: http://localhost/)
 API    : http://$IP:3000/api
 Giriş  : $OEMAIL  /  $OPASS
------------------------------------------------------------
 Durdur : $COMPOSE -f docker-compose.prod.yml down
 Başlat : $COMPOSE -f docker-compose.prod.yml up -d
 Güncelle: git pull && ./install.sh
============================================================
EOF
