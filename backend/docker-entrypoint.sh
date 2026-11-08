#!/bin/sh
# Konteyner girişi: root olarak başlar, yedek klasörünü "node" kullanıcısına yazılabilir yapar,
# sonra yetkiyi düşürüp uygulamayı çalıştırır. (Uygulama hiçbir zaman root olarak çalışmaz.)
set -e

DIR="${BACKUP_DIR:-backups}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DIR"
  # Eski sürümler birimi root olarak oluşturmuş olabilir; yalnız sahibi farklıysa düzelt
  # (büyük yedek klasöründe her açılışta özyinelemeli chown yapmamak için).
  if [ "$(stat -c %U "$DIR" 2>/dev/null)" != "node" ]; then
    chown -R node:node "$DIR"
  fi
  exec su-exec node:node "$@"
fi

exec "$@"
