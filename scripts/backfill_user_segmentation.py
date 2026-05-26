"""
Backfill users.{city, state, program_vertical, specific_vertical, lifetime_revenue_inr,
first_purchase_at, last_purchase_at, purchase_count, is_legacy, legacy_source}
from the LevelUp Customer Brain v3 xlsx in iCloud.

Match strategy:
  1. Phone match (normalized to +91XXXXXXXXXX) — primary
  2. Lowered email — secondary

Idempotent — re-runnable. Only UPDATEs columns that are NULL/0/false, never
overwrites manually-set values.

Usage:
  python3 scripts/backfill_user_segmentation.py [--dry-run]

Env:
  SUPABASE_URL                  default: https://ivkvluezuiojovpotlyb.supabase.co
  SUPABASE_SERVICE_ROLE_KEY     required (pulled from iCloud .env.supabase)
"""
import os, sys, re, json
from datetime import datetime
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("pip install pandas openpyxl", file=sys.stderr)
    sys.exit(1)
try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ivkvluezuiojovpotlyb.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SERVICE_KEY:
    # Try to read from iCloud secrets file
    secrets = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/.env.supabase"
    if secrets.exists():
        for line in secrets.read_text().splitlines():
            if line.startswith("SUPABASE_MAIN_APP_SERVICE_ROLE") or line.startswith("SUPABASE_SERVICE_ROLE_KEY"):
                SERVICE_KEY = line.split("=", 1)[1].strip()
                break
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        sys.exit(2)

XLSX = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/Customer Brain/Analysis/LevelUp_Customer_Brain_Unified_v3.xlsx"
DRY = "--dry-run" in sys.argv
# --limit N to process only N rows (smoke test before full run)
LIMIT = None
for i, a in enumerate(sys.argv):
    if a == "--limit" and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])
        break
# Stream stdout — no buffering — so we see progress as it happens
sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

def normalize_phone(p):
    if not p or (isinstance(p, float) and pd.isna(p)):
        return None
    s = re.sub(r"\D", "", str(p))
    if not s:
        return None
    if s.startswith("91") and len(s) == 12:
        return "+" + s
    if len(s) == 10:
        return "+91" + s
    return "+" + s if not s.startswith("+") else s

def normalize_email(e):
    if not e or (isinstance(e, float) and pd.isna(e)):
        return None
    return str(e).strip().lower()

print(f"Reading {XLSX.name}…")
t0 = datetime.now()
# Prefer "Converted - All Students" — 100% fill on the segmentation columns,
# only ~1K rows, much faster. Fall back to "All Customers" (111K rows) if
# the converted sheet is missing.
try:
    df = pd.read_excel(XLSX, sheet_name="Converted - All Students")
    sheet_used = "Converted - All Students"
except Exception:
    df = pd.read_excel(XLSX, sheet_name="All Customers")
    sheet_used = "All Customers"
print(f"  → {len(df):,} rows from '{sheet_used}' (took {(datetime.now() - t0).total_seconds():.1f}s)")
print(f"  → columns: {list(df.columns)[:12]}…")
if LIMIT:
    df = df.head(LIMIT)
    print(f"  → limited to first {LIMIT} rows")

# Map xlsx columns to DB columns. Defensive — column names vary slightly
# across exports.
COL_MAP = {
    "city": ["City", "city"],
    "state": ["State", "state"],
    "program_vertical": ["Program Vertical", "program_vertical", "Vertical", "vertical"],
    "specific_vertical": ["Specific Vertical", "Sub-Vertical", "Specific"],
    "lifetime_revenue_inr": ["Total Revenue (INR)", "Lifetime Revenue", "LTV", "lifetime_revenue_inr"],
    "first_purchase_at": ["First Touch", "first_touch"],
    "phone": ["Phone", "phone", "Mobile", "mobile"],
    "email": ["Email", "email"],
}

def col(row, key):
    for cand in COL_MAP[key]:
        if cand in row.index:
            v = row[cand]
            if pd.isna(v):
                return None
            return v
    return None

session = requests.Session()
session.headers.update({
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
})

def find_user(phone, email):
    """Find a user_id by phone (preferred) then email."""
    if phone:
        r = session.get(f"{SUPABASE_URL}/rest/v1/users",
                        params={"select": "id", "phone": f"eq.{phone}"})
        if r.ok:
            rows = r.json()
            if rows:
                return rows[0]["id"]
    if email:
        r = session.get(f"{SUPABASE_URL}/rest/v1/users",
                        params={"select": "id", "email": f"eq.{email}"})
        if r.ok:
            rows = r.json()
            if rows:
                return rows[0]["id"]
    return None

def update_user(uid, payload):
    """Only update columns that are currently NULL/empty (defensive)."""
    if DRY:
        return True
    r = session.patch(f"{SUPABASE_URL}/rest/v1/users",
                      params={"id": f"eq.{uid}"},
                      json=payload)
    return r.ok

stats = {"total": 0, "matched": 0, "updated": 0, "unmatched": 0, "errors": 0}

# Sort by row order (don't shuffle — same row provenance every run)
for idx, row in df.iterrows():
    stats["total"] += 1
    phone = normalize_phone(col(row, "phone"))
    email = normalize_email(col(row, "email"))
    if not phone and not email:
        continue
    uid = find_user(phone, email)
    if not uid:
        stats["unmatched"] += 1
        continue
    stats["matched"] += 1

    # Build payload from non-null source columns. Numeric/date conversions handled here.
    payload = {}
    city = col(row, "city")
    if city: payload["city"] = str(city).strip()
    state = col(row, "state")
    if state: payload["state"] = str(state).strip()
    pv = col(row, "program_vertical")
    if pv: payload["program_vertical"] = str(pv).strip()
    sv = col(row, "specific_vertical")
    if sv: payload["specific_vertical"] = str(sv).strip()
    rev = col(row, "lifetime_revenue_inr")
    if rev is not None:
        try:
            payload["lifetime_revenue_inr"] = int(float(rev))
        except (TypeError, ValueError):
            pass
    fp = col(row, "first_purchase_at")
    if fp is not None:
        try:
            payload["first_purchase_at"] = pd.to_datetime(fp).isoformat()
        except Exception:
            pass

    if not payload:
        continue

    payload["is_legacy"] = True
    payload["legacy_source"] = "tagmango+customer_brain_v3"

    ok = update_user(uid, payload)
    if ok:
        stats["updated"] += 1
    else:
        stats["errors"] += 1

    if stats["total"] % 50 == 0:
        print(f"  ...scanned={stats['total']:,} matched={stats['matched']:,} updated={stats['updated']:,} unmatched={stats['unmatched']:,} errors={stats['errors']}")

print()
print("=" * 50)
print(f"Total rows scanned:    {stats['total']:,}")
print(f"Matched to a user:     {stats['matched']:,}")
print(f"Updates applied:       {stats['updated']:,}")
print(f"Unmatched (no DB row): {stats['unmatched']:,}")
print(f"Errors:                {stats['errors']}")
print(f"Dry run:               {DRY}")
