#!/bin/bash
# Run read/write SQL against the LevelUp PRODUCTION Supabase project.
#
# The project ref is PINNED here on purpose: supabase/config.toml carries a
# STALE, WRONG project_id (see CLAUDE.md), and the Lighthouse project
# xfqsmlgvpzxbfkeqkroe must never be targeted. Do not parameterise this.
#
# Usage:  ops/lib/q.sh <<'SQL'
#         select count(*) from public.enrolments where status='active';
#         SQL
#
# Reads SUPABASE_PAT from ~/.levelup/.env.supabase. Never echoes it.
set -euo pipefail

ENV_FILE="${LEVELUP_ENV_FILE:-$HOME/.levelup/.env.supabase}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. See docs/prod-ops-runbook.md §1." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

REF="ivkvluezuiojovpotlyb"   # LevelUp Main App — PROD. Do not change.
QUERY="$(cat)"

curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -Rn --arg q "$QUERY" '{query:$q}')"
echo
