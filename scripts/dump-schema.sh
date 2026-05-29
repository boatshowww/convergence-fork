#!/usr/bin/env bash
#
# dump-schema.sh — Capture the live Convergence DB schema into supabase/schema.sql
#
# Docker-free. Uses the locally-installed pg_dump against the self-hosted Supabase
# Supavisor *session* pooler (port 5432 — session mode is pg_dump-safe; do NOT use
# the 6543 transaction port for dumps).
#
# The DB password is read from SUPABASE_DB_PASSWORD (env, or the repo .env) and is
# passed to pg_dump via the PGPASSWORD env var, so it never appears in the process
# list or in the output file.
#
# Usage:
#   bash scripts/dump-schema.sh              # -> supabase/schema.sql
#   npm run db:schema                        # same, via package.json
#
# Topology overrides (only needed if the VM/pooler setup changes):
#   SUPABASE_DB_HOST (default 192.168.1.105)
#   SUPABASE_DB_PORT (default 5432  — Supavisor session mode)
#   SUPABASE_DB_USER (default postgres.your-tenant-id — Supavisor needs postgres.<TENANT_ID>)
#   SUPABASE_DB_NAME (default postgres)
#
set -euo pipefail

DB_HOST="${SUPABASE_DB_HOST:-192.168.1.105}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_USER="${SUPABASE_DB_USER:-postgres.your-tenant-id}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
OUT="$ROOT/supabase/schema.sql"

# Resolve the password: prefer the environment, else pull it from .env.
if [[ -z "${SUPABASE_DB_PASSWORD:-}" && -f "$ENV_FILE" ]]; then
  SUPABASE_DB_PASSWORD="$(grep -E '^SUPABASE_DB_PASSWORD=' "$ENV_FILE" | head -1 \
    | sed 's/^SUPABASE_DB_PASSWORD=//' | tr -d '\r\n')"
fi
if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "ERROR: SUPABASE_DB_PASSWORD not set (and not found in $ENV_FILE)." >&2
  echo "       Add 'SUPABASE_DB_PASSWORD=...' to .env (it is gitignored)." >&2
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

echo "Dumping public schema from ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  -> $OUT"
pg_dump --schema-only --schema=public --no-owner \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$OUT"

# pg_dump 16+ injects a random \restrict/\unrestrict nonce on every run. Strip it
# so the file is deterministic and git diffs reflect real schema changes only.
sed -i '/^\\restrict /d; /^\\unrestrict /d' "$OUT"

echo "Done. Review the change with:  git diff supabase/schema.sql"
