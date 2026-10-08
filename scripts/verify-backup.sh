#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_file="${1:?Pass the backup file path}"
test -s "$backup_file"
restore_db="design_restore_check_$(date -u +%Y%m%d%H%M%S)"
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    docker compose --env-file .env.local exec -T db dropdb -U postgres "$restore_db"
  fi
}
trap cleanup EXIT
docker compose --env-file .env.local exec -T db createdb -U postgres "$restore_db"
created=true
docker compose --env-file .env.local exec -T db pg_restore -U postgres -d "$restore_db" --exit-on-error < "$backup_file"
docker compose --env-file .env.local exec -T db psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE role='admin' AND active) THEN RAISE EXCEPTION 'Missing active administrator'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE relname IN ('users','assessments','ratings','goals','materials') AND relrowsecurity)=5 THEN
  RAISE NOTICE 'User data and RLS flags restored';
 ELSE RAISE EXCEPTION 'Missing RLS protection'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='ratings' AND policyname='ratings_read') THEN RAISE EXCEPTION 'Missing rating access policy'; END IF;
END $$;
SQL
printf 'Restore checked in temporary database. It will be removed.\n'
