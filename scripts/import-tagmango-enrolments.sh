#!/usr/bin/env bash
#
# import-tagmango-enrolments.sh
# -----------------------------
# Ingests a CSV of TagMango transaction data into public.legacy_enrolments.
# Offerings are resolved via the legacy_program_mapping lookup table so
# CSV rows that reference programs we haven't yet recreated on the new
# app get parked with offering_id=NULL until Rahul fills in the mapping.
# The claim trigger then auto-grants real enrolments the first time each
# user signs in to the new LevelUp app (or retroactively when a mapping
# is filled in for users who already signed in).
#
# CSV format expected (header row required, column order doesn't matter):
#
#   phone,email,program_name,legacy_order_id,legacy_amount_inr,legacy_purchased_at
#
# - phone: any common Indian format. Examples that all normalise to +919876543210:
#     9876543210
#     +91 9876543210
#     91-9876-543-210
#     (+91) 9876543210
# - email: best-effort, used as fallback match when phone doesn't line up
# - program_name: the raw program/tagmango name as it appears in TagMango's
#   export (e.g. "Lokesh Kanagaraj's Filmmaking Masterclass", "Photography
#   Bootcamp 2024 Cohort 3"). NO slug translation here — the mapping table
#   handles that downstream.
# - legacy_order_id: TagMango's order/transaction id (free-text, audit only)
# - legacy_amount_inr: numeric, decimal allowed (e.g. 1499.00)
# - legacy_purchased_at: ISO8601 (2024-01-10T14:35:00Z) or YYYY-MM-DD
#
# Modes:
#   ./scripts/import-tagmango-enrolments.sh <csv>           — write to DB
#   ./scripts/import-tagmango-enrolments.sh <csv> --dry-run — preview only
#   ./scripts/import-tagmango-enrolments.sh <csv> --audit   — print missing-
#       offerings report; no DB writes. Use this FIRST when you get a new
#       CSV to see which TagMango programs don't have a mapping yet.
#
# Idempotent: re-runs are safe. The (source, phone, legacy_program_name)
# unique index means duplicate rows are silently ignored.

set -euo pipefail

CSV_PATH="${1:-}"
MODE="${2:-}"

if [ -z "$CSV_PATH" ] || [ ! -f "$CSV_PATH" ]; then
  echo "Usage: $0 <csv-file> [--dry-run|--audit]" >&2
  echo "       CSV must have columns: phone,email,program_name,legacy_order_id,legacy_amount_inr,legacy_purchased_at" >&2
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

# Pull the current offerings catalogue once. Used by both the audit
# fuzzy-match and the import for sanity. We dump as TSV for easy parsing.
OFFERINGS_TSV=$(mktemp)
trap 'rm -f "$OFFERINGS_TSV" "${TMP_NORMALISED:-}"' EXIT
psql "$PGCONN" -A -F $'\t' -t -c \
  "SELECT id, slug, title, status FROM public.offerings ORDER BY title;" \
  > "$OFFERINGS_TSV"

# Same for existing mappings so the audit can show "already mapped".
MAPPINGS_TSV=$(mktemp)
trap 'rm -f "$OFFERINGS_TSV" "$MAPPINGS_TSV" "${TMP_NORMALISED:-}"' EXIT
psql "$PGCONN" -A -F $'\t' -t -c \
  "SELECT source, legacy_program_name, offering_id, decision_status
     FROM public.legacy_program_mapping;" \
  > "$MAPPINGS_TSV"

# ────────────────────────────────────────────────────────────────────
# Audit mode: profile the CSV without writing anything to the DB
# ────────────────────────────────────────────────────────────────────
if [ "$MODE" = "--audit" ]; then
  python3 <<PYTHON_AUDIT
import csv, re, sys
from collections import defaultdict
from difflib import SequenceMatcher

def normalise_phone(raw):
    if not raw: return None
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 10: return '+91' + digits
    if len(digits) == 12 and digits.startswith('91'): return '+' + digits
    if len(digits) == 13 and digits.startswith('091'): return '+91' + digits[3:]
    return None

def similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

# Load current offerings
offerings = []
with open("$OFFERINGS_TSV") as f:
    for line in f:
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 4:
            offerings.append({'id': parts[0], 'slug': parts[1], 'title': parts[2], 'status': parts[3]})

# Load existing mappings
mappings = {}
with open("$MAPPINGS_TSV") as f:
    for line in f:
        parts = line.rstrip('\n').split('\t')
        if len(parts) >= 4:
            mappings[(parts[0], parts[1])] = {'offering_id': parts[2] or None, 'decision_status': parts[3]}

# Tally CSV
program_users = defaultdict(set)  # program_name -> {phones}
program_emails = defaultdict(set)
program_orders = defaultdict(list)
bad_phone = 0
bad_program = 0
total = 0

with open("$CSV_PATH", newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    keys = {k.lower().strip(): k for k in (reader.fieldnames or [])}
    required = ['phone', 'program_name']
    missing = [r for r in required if r not in keys]
    if missing:
        sys.stderr.write(f"CSV missing required columns: {missing}\n")
        sys.stderr.write(f"Found columns: {list(keys.keys())}\n")
        sys.exit(2)

    for row in reader:
        total += 1
        phone = normalise_phone(row.get(keys['phone'], ''))
        program = (row.get(keys['program_name'], '') or '').strip()
        email = (row.get(keys.get('email', ''), '') or '').strip().lower()
        if not phone:
            bad_phone += 1
            continue
        if not program:
            bad_program += 1
            continue
        program_users[program].add(phone)
        if email:
            program_emails[program].add(email)
        order_id = (row.get(keys.get('legacy_order_id', ''), '') or '').strip()
        if order_id:
            program_orders[program].append(order_id)

# Sort programs by user count descending
ranked = sorted(program_users.items(), key=lambda x: -len(x[1]))

# Classify each program
mapped, pending_with_suggestion, pending_no_match = [], [], []

for program, phones in ranked:
    user_count = len(phones)
    existing = mappings.get(('tagmango', program))
    if existing and existing['offering_id']:
        # find offering title
        o = next((o for o in offerings if o['id'] == existing['offering_id']), None)
        mapped.append((program, user_count, o['title'] if o else '?', o['slug'] if o else '?', o['status'] if o else '?'))
    else:
        # fuzzy match against offerings.title
        best = None
        best_score = 0
        for o in offerings:
            s = similarity(program, o['title'])
            if s > best_score:
                best_score = s
                best = o
        if best and best_score >= 0.55:
            pending_with_suggestion.append((program, user_count, best['title'], best['slug'], best['status'], best_score))
        else:
            pending_no_match.append((program, user_count))

# ── Report
print()
print("=" * 80)
print("  TAGMANGO CSV AUDIT REPORT")
print("=" * 80)
print(f"  Rows scanned       : {total}")
print(f"  Unique programs    : {len(program_users)}")
print(f"  Unique users       : {len(set().union(*program_users.values())) if program_users else 0}")
print(f"  Skipped (bad phone): {bad_phone}")
print(f"  Skipped (no prog)  : {bad_program}")
print()

if mapped:
    print("─" * 80)
    print("  ALREADY MAPPED — will import cleanly")
    print("─" * 80)
    for program, count, title, slug, status in mapped:
        print(f"  {count:>5}  {program}")
        print(f"        → {slug}  ({status})  \"{title}\"")
    print()

if pending_with_suggestion:
    print("─" * 80)
    print("  PENDING — fuzzy match suggests an existing offering (REVIEW)")
    print("─" * 80)
    for program, count, title, slug, status, score in pending_with_suggestion:
        print(f"  {count:>5}  {program}")
        print(f"        ?  {slug}  ({status})  \"{title}\"  [similarity {score:.2f}]")
    print()

if pending_no_match:
    print("─" * 80)
    print("  PENDING — no match on the new app, OFFERING MUST BE CREATED")
    print("─" * 80)
    for program, count in pending_no_match:
        print(f"  {count:>5}  {program}")
    print()

# Summary stats
print("─" * 80)
print("  SUMMARY")
print("─" * 80)
print(f"  Programs already mapped         : {len(mapped):>4}")
print(f"  Programs needing review         : {len(pending_with_suggestion):>4}")
print(f"  Programs needing creation       : {len(pending_no_match):>4}")
mapped_users = sum(c for _, c, *_ in mapped)
pending_review_users = sum(c for _, c, *_ in pending_with_suggestion)
pending_create_users = sum(c for _, c in pending_no_match)
print(f"  Users auto-claimable now        : {mapped_users:>4}")
print(f"  Users waiting on review         : {pending_review_users:>4}")
print(f"  Users waiting on new offerings  : {pending_create_users:>4}")
print()
print("Audit complete — no DB writes performed.")
PYTHON_AUDIT
  exit 0
fi

# ────────────────────────────────────────────────────────────────────
# Normalise + insert (--dry-run or real)
# ────────────────────────────────────────────────────────────────────
TMP_NORMALISED=$(mktemp)

python3 <<PYTHON_NORMALISE > "$TMP_NORMALISED"
import csv, re, sys

def normalise_phone(raw):
    if not raw: return None
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 10: return '+91' + digits
    if len(digits) == 12 and digits.startswith('91'): return '+' + digits
    if len(digits) == 13 and digits.startswith('091'): return '+91' + digits[3:]
    return None

with open("$CSV_PATH", newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    keys = {k.lower().strip(): k for k in (reader.fieldnames or [])}
    required = ['phone', 'program_name']
    missing = [r for r in required if r not in keys]
    if missing:
        sys.stderr.write(f"CSV missing required columns: {missing}\n")
        sys.stderr.write(f"Found columns: {list(keys.keys())}\n")
        sys.exit(2)

    writer = csv.writer(sys.stdout)
    writer.writerow(['phone', 'email', 'program_name', 'legacy_order_id', 'legacy_amount_inr', 'legacy_purchased_at'])
    skipped = 0
    written = 0
    for row in reader:
        phone = normalise_phone(row.get(keys['phone'], ''))
        program = (row.get(keys['program_name'], '') or '').strip()
        if not phone or not program:
            skipped += 1
            continue
        email = (row.get(keys.get('email', ''), '') or '').strip().lower() or None
        order_id = (row.get(keys.get('legacy_order_id', ''), '') or '').strip() or None
        amount = (row.get(keys.get('legacy_amount_inr', ''), '') or '').strip() or None
        purchased_at = (row.get(keys.get('legacy_purchased_at', ''), '') or '').strip() or None
        writer.writerow([phone, email or '', program, order_id or '', amount or '', purchased_at or ''])
        written += 1
    sys.stderr.write(f"Normalised {written} rows, skipped {skipped} (bad phone or missing program_name).\n")
PYTHON_NORMALISE

ROWS=$(($(wc -l < "$TMP_NORMALISED") - 1))
echo "Ready to insert $ROWS rows into legacy_enrolments."

if [ "$MODE" = "--dry-run" ]; then
  echo "--- DRY RUN: first 10 normalised rows ---"
  head -11 "$TMP_NORMALISED"
  echo "--- DRY RUN: end (nothing written to DB) ---"
  exit 0
fi

# Stage CSV into a temp table, then INSERT ... SELECT, resolving
# offering_id via the mapping table (LEFT JOIN allows NULL for pending).
psql "$PGCONN" -v ON_ERROR_STOP=1 <<SQL_SCRIPT
BEGIN;

CREATE TEMP TABLE _tm_stage (
  phone               text,
  email               text,
  program_name        text,
  legacy_order_id     text,
  legacy_amount_inr   numeric(10, 2),
  legacy_purchased_at timestamptz
) ON COMMIT DROP;

\\copy _tm_stage FROM '$TMP_NORMALISED' WITH (FORMAT csv, HEADER, NULL '')

-- Auto-seed legacy_program_mapping rows so every distinct program_name
-- in the CSV gets a row in the mapping table (decision_status='pending'
-- by default). Admin can then fill in offering_id later.
INSERT INTO public.legacy_program_mapping (source, legacy_program_name, decision_status)
SELECT DISTINCT 'tagmango', s.program_name, 'pending'
FROM _tm_stage s
WHERE s.program_name IS NOT NULL AND s.program_name <> ''
ON CONFLICT (source, legacy_program_name) DO NOTHING;

-- Insert enrolments. LEFT JOIN to mapping so unmapped programs still
-- get a row in legacy_enrolments with offering_id=NULL. ON CONFLICT
-- handles re-runs.
INSERT INTO public.legacy_enrolments
  (phone, email, offering_id, source, legacy_program_name,
   legacy_order_id, legacy_amount_inr, legacy_purchased_at)
SELECT s.phone,
       NULLIF(s.email, ''),
       m.offering_id,                       -- NULL if unmapped
       'tagmango',
       s.program_name,
       NULLIF(s.legacy_order_id, ''),
       s.legacy_amount_inr,
       s.legacy_purchased_at
FROM _tm_stage s
LEFT JOIN public.legacy_program_mapping m
  ON m.source = 'tagmango' AND m.legacy_program_name = s.program_name
ON CONFLICT (source, phone, legacy_program_name) DO NOTHING;

-- Refresh denormalised user_count on mapping rows so the admin UI
-- can show "X users blocked on this mapping" without a subquery.
UPDATE public.legacy_program_mapping m
SET user_count = sub.cnt
FROM (
  SELECT source, legacy_program_name, count(DISTINCT phone) AS cnt
  FROM public.legacy_enrolments
  GROUP BY source, legacy_program_name
) sub
WHERE m.source = sub.source AND m.legacy_program_name = sub.legacy_program_name;

-- Report final state
SELECT
  count(*) FILTER (WHERE offering_id IS NOT NULL) AS mapped_rows,
  count(*) FILTER (WHERE offering_id IS NULL)     AS pending_rows,
  count(*) FILTER (WHERE claimed_by_user_id IS NULL)     AS unclaimed,
  count(*) FILTER (WHERE claimed_by_user_id IS NOT NULL) AS already_claimed,
  count(*) AS total_legacy_rows
FROM public.legacy_enrolments;

SELECT
  decision_status,
  count(*) AS programs,
  sum(user_count) AS users
FROM public.legacy_program_mapping
GROUP BY decision_status
ORDER BY decision_status;

COMMIT;
SQL_SCRIPT

echo "Import complete."
echo "Next: open /admin/legacy-mappings to fill in offering_id for pending programs."
echo "Mapped users get auto-claimed on signin; pending users wait for the mapping."
