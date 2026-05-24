#!/usr/bin/env bash
#
# import-tagmango-enrolments.sh
# -----------------------------
# Ingests a CSV of TagMango transaction data into public.legacy_enrolments.
# The claim trigger then auto-grants real enrolments the first time each
# user signs in to the new LevelUp app.
#
# CSV format expected (header row required, column order doesn't matter):
#
#   phone,email,offering_slug,legacy_order_id,legacy_amount_inr,legacy_purchased_at
#
# - phone: any common Indian format. Examples that all normalise to +919876543210:
#     9876543210
#     +91 9876543210
#     91-9876-543-210
#     (+91) 9876543210
# - email: best-effort, used as fallback match when phone doesn't line up
# - offering_slug: matches the slug column of public.offerings. We have 7:
#     lokesh-kanagaraj-teaches-film-making
#     nelson-dilipkumar-teaches-filmmaking
#     karthick-subbaraj-teaches-filmmaking
#     ravi-basrur-teaches-music-composition
#     anthony-gonsalvez-teaches-film-editing
#     drk-kiran-teaches-art-direction
#     g-venket-ram-teaches-photography
# - legacy_order_id: TagMango's order/transaction id (free-text, audit only)
# - legacy_amount_inr: numeric, decimal allowed (e.g. 1499.00)
# - legacy_purchased_at: ISO8601 (2024-01-10T14:35:00Z) or YYYY-MM-DD
#
# Usage:
#   ./scripts/import-tagmango-enrolments.sh path/to/export.csv [--dry-run]
#
# --dry-run prints what WOULD be inserted without writing to the database.
#
# Idempotent: re-runs are safe. The (phone, offering_id) unique constraint
# means duplicate rows are silently ignored.

set -euo pipefail

CSV_PATH="${1:-}"
DRY_RUN="${2:-}"

if [ -z "$CSV_PATH" ] || [ ! -f "$CSV_PATH" ]; then
  echo "Usage: $0 <csv-file> [--dry-run]" >&2
  echo "       CSV must have columns: phone,email,offering_slug,legacy_order_id,legacy_amount_inr,legacy_purchased_at" >&2
  exit 1
fi

# Load Supabase connection details
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a
source "/Users/rahulsrinivas/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/.env.supabase"
set +a

REF="$SUPABASE_MAIN_APP_REF"
ENC_PASS=$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['SUPABASE_MAIN_APP_DB_PASS'], safe=''))")
PGCONN="postgresql://postgres.${REF}:${ENC_PASS}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require"

# Build a temp file with normalised rows. The slug → offering_id lookup
# happens in SQL so we don't have to maintain a static mapping here.
TMP_NORMALISED=$(mktemp)
trap 'rm -f "$TMP_NORMALISED"' EXIT

python3 <<PYTHON_SCRIPT > "$TMP_NORMALISED"
import csv, re, sys

def normalise_phone(raw):
    if not raw:
        return None
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 10:
        return '+91' + digits
    if len(digits) == 12 and digits.startswith('91'):
        return '+' + digits
    if len(digits) == 13 and digits.startswith('091'):
        return '+91' + digits[3:]
    return None  # signal: skip this row

with open("$CSV_PATH", newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    # case-insensitive header lookup
    keys = {k.lower().strip(): k for k in reader.fieldnames or []}
    required = ['phone', 'offering_slug']
    missing = [r for r in required if r not in keys]
    if missing:
        sys.stderr.write(f"CSV missing required columns: {missing}\n")
        sys.stderr.write(f"Found columns: {list(keys.keys())}\n")
        sys.exit(2)

    writer = csv.writer(sys.stdout)
    writer.writerow(['phone', 'email', 'offering_slug', 'legacy_order_id', 'legacy_amount_inr', 'legacy_purchased_at'])
    skipped = 0
    written = 0
    for row in reader:
        phone = normalise_phone(row.get(keys['phone'], ''))
        if not phone:
            skipped += 1
            continue
        email = (row.get(keys.get('email', ''), '') or '').strip().lower() or None
        slug = (row.get(keys['offering_slug'], '') or '').strip()
        if not slug:
            skipped += 1
            continue
        order_id = (row.get(keys.get('legacy_order_id', ''), '') or '').strip() or None
        amount = (row.get(keys.get('legacy_amount_inr', ''), '') or '').strip() or None
        purchased_at = (row.get(keys.get('legacy_purchased_at', ''), '') or '').strip() or None
        writer.writerow([phone, email or '', slug, order_id or '', amount or '', purchased_at or ''])
        written += 1
    sys.stderr.write(f"Normalised {written} rows, skipped {skipped} (bad phone or missing offering_slug).\n")
PYTHON_SCRIPT

ROWS=$(($(wc -l < "$TMP_NORMALISED") - 1))
echo "Ready to insert $ROWS rows into legacy_enrolments."

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "--- DRY RUN: first 10 normalised rows ---"
  head -11 "$TMP_NORMALISED"
  echo "--- DRY RUN: end (nothing written to DB) ---"
  exit 0
fi

# Stage CSV into a temp table, then INSERT ... SELECT to resolve slugs.
psql "$PGCONN" -v ON_ERROR_STOP=1 <<SQL_SCRIPT
BEGIN;

CREATE TEMP TABLE _tm_stage (
  phone               text,
  email               text,
  offering_slug       text,
  legacy_order_id     text,
  legacy_amount_inr   numeric(10, 2),
  legacy_purchased_at timestamptz
) ON COMMIT DROP;

\\copy _tm_stage FROM '$TMP_NORMALISED' WITH (FORMAT csv, HEADER, NULL '')

-- Audit: how many staged rows match a known offering slug
SELECT
  count(*) FILTER (WHERE o.id IS NOT NULL) AS matched,
  count(*) FILTER (WHERE o.id IS NULL) AS slug_not_found
FROM _tm_stage s
LEFT JOIN public.offerings o ON o.slug = s.offering_slug;

INSERT INTO public.legacy_enrolments
  (phone, email, offering_id, legacy_order_id, legacy_amount_inr, legacy_purchased_at)
SELECT s.phone, NULLIF(s.email, ''), o.id, NULLIF(s.legacy_order_id, ''),
       s.legacy_amount_inr, s.legacy_purchased_at
FROM _tm_stage s
JOIN public.offerings o ON o.slug = s.offering_slug
ON CONFLICT (phone, offering_id) DO NOTHING;

-- Report final state
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE claimed_by_user_id IS NULL) AS unclaimed,
  count(*) FILTER (WHERE claimed_by_user_id IS NOT NULL) AS already_claimed
FROM public.legacy_enrolments;

COMMIT;
SQL_SCRIPT

echo "Import complete. Existing users will auto-claim on their next signin."
