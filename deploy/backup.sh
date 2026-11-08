#!/usr/bin/env bash
set -euo pipefail
umask 077

cd /opt/shiri/app
mkdir -p /opt/shiri/backups

stamp=$(date +%F)
final="/opt/shiri/backups/shiri-$stamp.dump"
temporary="$final.tmp"
trap 'rm -f "$temporary"' EXIT

docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db \
  pg_dump -U shiri -Fc shiri > "$temporary"
mv "$temporary" "$final"
find /opt/shiri/backups -name 'shiri-*.dump' -mtime +14 -delete
