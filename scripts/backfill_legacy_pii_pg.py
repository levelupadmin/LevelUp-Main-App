"""
Direct-postgres backfill of legacy_enrolments.{full_name, city, state}
keyed on phone (not id) — avoids the giant 73K-row SELECT that drops
the pooler SSL connection.

Pattern:
  1. Build per-phone payloads locally from the xlsx files
  2. Upload to a temp staging table via execute_values
  3. Run a single UPDATE legacy_enrolments SET … FROM staging WHERE
     phone = phone — all server-side.
  4. DROP staging.

Usage:  python3 scripts/backfill_legacy_pii_pg.py [--dry-run]
"""
import sys, re
from pathlib import Path
import pandas as pd
import psycopg2
import psycopg2.extras

DSN = (
    "host=aws-1-ap-northeast-1.pooler.supabase.com "
    "port=6543 "
    "user=postgres.ivkvluezuiojovpotlyb "
    "password=Levelup@290722 "
    "dbname=postgres "
    "sslmode=require "
    "connect_timeout=15"
)

ROOT = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/Customer Brain/Analysis"
TM_ORDERS  = ROOT / "LevelUp_TagMango_Orders_Master.xlsx"
CB_UNIFIED = ROOT / "LevelUp_Customer_Brain_Unified_v3.xlsx"
DRY = "--dry-run" in sys.argv

sys.stdout.reconfigure(line_buffering=True)

def normalize_phone(p):
    """Force pandas float → int → str so scientific-notation precision
    loss doesn't mangle the digits (9.959485e+09 → 9959485000)."""
    if p is None or (isinstance(p, float) and pd.isna(p)):
        return None
    if isinstance(p, float):
        try:
            p = int(p)
        except (ValueError, OverflowError):
            return None
    s = re.sub(r"\D", "", str(p))
    if not s: return None
    if s.startswith("91") and len(s) == 12: return "+" + s
    if len(s) == 10: return "+91" + s
    if len(s) == 11 and s.startswith("0"): return "+91" + s[1:]   # e.g. 09876543210
    return None  # unrecognized — better to skip than to mis-tag

def clean_text(v):
    """pd cells can come back as float('nan') → str → literal 'nan'.
    Reject those + empties + common pandas/Excel sentinel values."""
    if v is None: return None
    if isinstance(v, float) and pd.isna(v): return None
    s = str(v).strip()
    if not s: return None
    if s.lower() in ("nan", "none", "null", "n/a", "na"): return None
    return s

# ───── Build per-phone payload ─────
print(f"Loading {TM_ORDERS.name}…")
tm = pd.read_excel(TM_ORDERS, sheet_name="All Completed Orders")
payload = {}  # phone -> [name, city, state]
for _, r in tm.iterrows():
    ph = normalize_phone(r.get("Phone"))
    if not ph: continue
    name = clean_text(r.get("Name"))
    state = clean_text(r.get("State"))
    if name or state:
        cur = payload.setdefault(ph, [None, None, None])
        if name and not cur[0]: cur[0] = name
        if state and not cur[2]: cur[2] = state
print(f"  TM master indexed: {len(payload):,} phones with name or state")

print(f"Loading {CB_UNIFIED.name}…")
cb = pd.read_excel(CB_UNIFIED, sheet_name="All Customers")
for _, r in cb.iterrows():
    ph = normalize_phone(r.get("Phone"))
    if not ph: continue
    city = clean_text(r.get("City"))
    if not city: continue
    cur = payload.setdefault(ph, [None, None, None])
    if not cur[1]:
        cur[1] = city
print(f"  Total phones with any data: {len(payload):,}")

# ───── Build staging rows ─────
rows = [(phone, v[0], v[1], v[2]) for phone, v in payload.items() if v[0] or v[1] or v[2]]
print(f"  Staging rows: {len(rows):,}")

if DRY:
    print("\n--dry-run preview, first 5:")
    for r in rows[:5]:
        print(f"  {r}")
    sys.exit(0)

# ───── Connect, build staging, do bulk UPDATE ─────
print("\nConnecting to Postgres pooler…")
conn = psycopg2.connect(DSN)
conn.autocommit = False

with conn.cursor() as cur:
    print("Creating staging table…")
    # Cannot use TEMP — transaction-mode pgbouncer multiplexes the
    # connection so temp tables vanish between queries. Use a regular
    # table in public and DROP at end. Named with underscore prefix
    # so it's clearly transient.
    cur.execute("DROP TABLE IF EXISTS public._legacy_pii_staging;")
    cur.execute("""
        CREATE TABLE public._legacy_pii_staging (
            phone     text PRIMARY KEY,
            full_name text,
            city      text,
            state     text
        );
    """)

    print("Uploading staging rows…")
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO public._legacy_pii_staging (phone, full_name, city, state) VALUES %s ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, city = EXCLUDED.city, state = EXCLUDED.state;",
        rows,
        template="(%s,%s,%s,%s)",
        page_size=2000,
    )
    print(f"  Staging populated.")

    print("Running bulk UPDATE legacy_enrolments…")
    cur.execute("""
        UPDATE public.legacy_enrolments AS le SET
          full_name = COALESCE(le.full_name, s.full_name),
          city      = COALESCE(le.city,      s.city),
          state     = COALESCE(le.state,     s.state)
        FROM public._legacy_pii_staging s
        WHERE le.phone = s.phone
          AND (
            (le.full_name IS NULL AND s.full_name IS NOT NULL)
            OR (le.city  IS NULL AND s.city  IS NOT NULL)
            OR (le.state IS NULL AND s.state IS NOT NULL)
          );
    """)
    updated = cur.rowcount
    print(f"  Updated: {updated:,} rows")

    cur.execute("DROP TABLE IF EXISTS public._legacy_pii_staging;")
    conn.commit()
    print("Committed.")

    # Stats
    cur.execute("SELECT COUNT(*) FROM legacy_enrolments WHERE full_name IS NOT NULL")
    print(f"\nlegacy_enrolments with full_name: {cur.fetchone()[0]:,}")
    cur.execute("SELECT COUNT(*) FROM legacy_enrolments WHERE city IS NOT NULL")
    print(f"legacy_enrolments with city:      {cur.fetchone()[0]:,}")
    cur.execute("SELECT COUNT(*) FROM legacy_enrolments WHERE state IS NOT NULL")
    print(f"legacy_enrolments with state:     {cur.fetchone()[0]:,}")

conn.close()
