#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — Docker loglarını temizler (Linux / macOS)
#
#   ./scripts/clear-logs.sh            → logları sıfırla
#   ./scripts/clear-logs.sh --prune    → ayrıca kullanılmayan imaj/önbelleği sil
#
# Docker'ın log dosyaları container'a aittir ve container silindiğinde birlikte
# silinir. Bu yüzden servisler `down` edilip yeniden `up` edilir.
# Veritabanı adlandırılmış volume'de (pgdata) durduğu için VERİ SİLİNMEZ —
# `down -v` bilerek KULLANILMAZ.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)

if ! docker info >/dev/null 2>&1; then
  echo "[HATA] Docker çalışmıyor." >&2
  exit 1
fi

echo "Mevcut log boyutları:"
for name in $(docker ps -a --filter 'name=stocktrack' --format '{{.Names}}'); do
  log_path=$(docker inspect --format '{{.LogPath}}' "$name" 2>/dev/null || true)
  if [ -n "$log_path" ] && [ -r "$log_path" ]; then
    printf '  %-24s %s\n' "$name" "$(du -h "$log_path" | cut -f1)"
  else
    printf '  %-24s (boyut okunamadı)\n' "$name"
  fi
done

echo
echo "Servisler durduruluyor (VERİTABANI SİLİNMEZ — down -v kullanılmıyor)…"
"${COMPOSE[@]}" down

if [ "${1:-}" = "--prune" ]; then
  echo "Kullanılmayan imaj ve derleme önbelleği temizleniyor…"
  docker image prune -f >/dev/null
  docker builder prune -f >/dev/null
fi

echo "Servisler yeniden başlatılıyor…"
"${COMPOSE[@]}" up -d

echo
echo "Loglar temizlendi, servisler çalışıyor. Veritabanı korundu (pgdata)."
