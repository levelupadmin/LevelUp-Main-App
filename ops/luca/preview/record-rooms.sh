#!/usr/bin/env bash
# Record the ten demo days for the click-through preview and the render test.
#
# Needs a SCRATCH Postgres (never production) that has the LUCA migrations and
# ops/luca/demo/seed.sql loaded, plus a public.users row for STAFF_ID with
# role 'admin'. Writes ops/luca/preview/rooms/<stage>{,.desk,.clock}.json.
#
#   DATABASE_URL=postgres://postgres@127.0.0.1:54999/scratch STAFF_ID=<uuid> ops/luca/preview/record-rooms.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a scratch database}"
: "${STAFF_ID:?set STAFF_ID to an admin user id in that database}"
case "$DATABASE_URL" in *supabase.co*|*supabase.com*|*pooler*) echo "Refusing: this looks like a Supabase project, not a scratch database." >&2; exit 1;; esac
OUT="$(cd "$(dirname "$0")" && pwd)/rooms"
mkdir -p "$OUT"
as_staff="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${STAFF_ID}',false);"
for st in browse applied decision prestart orientation week1 week5 sprint demo alumni; do
  psql "$DATABASE_URL" -Atq -v ON_ERROR_STOP=1 -c "$as_staff SELECT luca_demo_scenario('luca-demo','$st');" >/dev/null
  psql "$DATABASE_URL" -Atq -c "$as_staff SELECT luca_room('luca-demo');" | tail -1 > "$OUT/$st.json"
  psql "$DATABASE_URL" -Atq -c "$as_staff SELECT luca_desk('luca-demo');" | tail -1 > "$OUT/$st.desk.json"
  psql "$DATABASE_URL" -Atq -c "$as_staff SELECT luca_demo_clock('luca-demo');" | tail -1 > "$OUT/$st.clock.json"
  echo "recorded $st"
done
