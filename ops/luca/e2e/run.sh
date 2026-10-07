#!/usr/bin/env bash
# LUCA end-to-end suite against a SCRATCH Postgres. Builds a fresh database,
# loads the main-app stand-ins, every LUCA migration, the demo seed and a real
# cohort, then runs suite.sql and prints PASS/FAIL per check.
#
#   PGHOST=127.0.0.1 PGPORT=54999 PGUSER=postgres ops/luca/e2e/run.sh [dbname]
#
# Refuses anything that looks like a Supabase host. Exit code 1 if any check fails.
set -euo pipefail
DB="${1:-luca_e2e}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "Refusing: PGHOST looks like Supabase. Scratch databases only." >&2; exit 1;; esac
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
E2E="$ROOT/ops/luca/e2e"
q() { psql -d "$DB" -q -v ON_ERROR_STOP=1 "$@" 2>&1 | grep -vE "^(NOTICE|psql:.*NOTICE)" || true; }

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
for f in "$E2E/stubs.sql" \
         "$ROOT"/supabase/migrations/2026100710*_luca_*.sql \
         "$ROOT/ops/luca/demo/seed.sql" \
         "$E2E/fixtures.sql"; do
  out=$(psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -vE "NOTICE" || true)
  if echo "$out" | grep -q "ERROR"; then echo "LOAD FAILED: $f"; echo "$out" | grep -m3 ERROR; exit 1; fi
done
echo "loaded: stubs, $(ls "$ROOT"/supabase/migrations/2026100710*_luca_*.sql | wc -l | tr -d ' ') LUCA migrations, demo seed, real cohort"

[ "${LOAD_ONLY:-}" = "1" ] && exit 0
psql -d "$DB" -q -v ON_ERROR_STOP=0 -f "$E2E/suite.sql" 2>&1 | grep -E "^(ERROR|psql:.*ERROR)" | head -5 || true
psql -d "$DB" -At -F ' ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE COALESCE('  -> ' || detail, '') END FROM t.results ORDER BY n"
read -r pass fail < <(psql -d "$DB" -At -F ' ' -c "SELECT count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok) FROM t.results")
echo "----"
echo "$pass passed, $fail failed"
[ "$fail" = "0" ]
