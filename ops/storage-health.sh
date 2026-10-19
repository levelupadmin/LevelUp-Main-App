#!/bin/bash
# Read-only health check for course media on PRODUCTION. Exits 1 if anything
# would stop an admin uploading or a student playing.
#
#   ops/storage-health.sh
#
# Checks:
#  1. Project status (a paused project = nothing loads at all).
#  2. The project-wide upload cap (Storage settings) is at least every bucket's
#     own limit. On 2026-10-09 an overdue invoice paused the org and dropped it
#     to Free, which silently reset this cap to 50 MB. Re-upgrading to Pro did
#     NOT restore it, so every class recording failed with "Upload failed
#     (400)" for 12 days while the buckets still said 10 GB.
#  3. Chapters whose protected file is missing from storage (students get a
#     dead player). Before 2026-10-19 the admin uploader wrote the key onto the
#     chapter before the upload finished, so every failed upload left one.
#
# Reads SUPABASE_PAT from ~/.levelup/.env.supabase. Never echoes it.
set -euo pipefail

ENV_FILE="${LEVELUP_ENV_FILE:-$HOME/.levelup/.env.supabase}"
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found." >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
REF="ivkvluezuiojovpotlyb"   # LevelUp Main App — PROD. Do not change.
HERE="$(cd "$(dirname "$0")" && pwd)"
api() { curl -sS -H "Authorization: Bearer $SUPABASE_PAT" "https://api.supabase.com/v1/projects/$REF$1"; }
fail=0

status=$(api "" | jq -r '.status')
echo "Project status: $status"
[ "$status" = "ACTIVE_HEALTHY" ] || { echo "  ✗ project is not healthy — check billing / the dashboard first"; fail=1; }

cap=$(api "/config/storage" | jq -r '.fileSizeLimit')
max_bucket=$("$HERE/lib/q.sh" <<'SQL' | jq -r '.[0].max // 0'
select max(file_size_limit) as max from storage.buckets;
SQL
)
echo "Upload cap: $((cap / 1024 / 1024)) MB · largest bucket limit: $((max_bucket / 1024 / 1024)) MB"
if [ "$cap" -lt "$max_bucket" ]; then
  echo "  ✗ the project-wide cap is below a bucket limit — larger uploads fail with 'Payload too large'."
  echo "    Fix: PATCH /v1/projects/$REF/config/storage {\"fileSizeLimit\": $max_bucket}"
  fail=1
fi

dead=$("$HERE/lib/q.sh" <<'SQL'
select co.title as course, c.title as chapter, c.id, c.updated_at::date as since
from chapters c
join sections s on s.id = c.section_id
join courses co on co.id = s.course_id
left join storage.objects o on o.bucket_id = 'protected-video' and o.name = c.media_url
where c.media_provider = 'supabase-signed' and c.media_url is not null and o.id is null
order by co.title, s.sort_order, c.sort_order;
SQL
)
n=$(echo "$dead" | jq 'length')
echo "Chapters pointing at a missing file: $n"
if [ "$n" -gt 0 ]; then
  echo "$dead" | jq -r '.[] | "  ✗ \(.course) → \(.chapter)  (since \(.since), id \(.id))"'
  echo "  Re-upload each from Admin → Courses → Curriculum (the lesson shows a red 'missing' line)."
  fail=1
fi

[ "$fail" -eq 0 ] && echo "OK — uploads and playback are healthy."
exit "$fail"
