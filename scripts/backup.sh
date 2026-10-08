#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
backup_file="backups/design-growth-$(date -u +%Y%m%d-%H%M%S).dump"
docker compose --env-file .env.local exec -T db pg_dump -U postgres -d design_growth --format=custom > "$backup_file"
test -s "$backup_file"
printf 'Backup created: %s\n' "$backup_file"
