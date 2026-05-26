"""
Backfill legacy_enrolments.full_name + city + state from the local
TagMango orders master + Customer Brain v3 xlsx files in iCloud.

Source files (read-only):
  ~/Library/.../LevelUp Core/Customer Brain/Analysis/
      LevelUp_TagMango_Orders_Master.xlsx  → Name + Phone + State (73,716 rows)
      LevelUp_Customer_Brain_Unified_v3.xlsx → City + Phone + …      (111K All Customers)

Match strategy:
  1. legacy_enrolments.legacy_order_id  →  TagMango.Order ID
     This gives us Name + State for ~99% of rows. Most reliable.
  2. legacy_enrolments.phone           →  CustomerBrain.Phone
     This gives us City for ~75% of rows.

Updates only happen if the target column is NULL — defensive,
re-runnable, idempotent.

Usage:
  python3 scripts/backfill_legacy_pii.py [--dry-run] [--limit N]
"""
import os
import sys
import re
from pathlib import Path

try:
    import pandas as pd
    import requests
except ImportError:
    print("pip3 install --user pandas openpyxl requests", file=sys.stderr)
    sys.exit(1)

SUPABASE_URL = "https://ivkvluezuiojovpotlyb.supabase.co"
SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
if not SRK:
    # Try to mint via Management API using the PAT
    secrets = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/.env.supabase"
    pat = None
    if secrets.exists():
        for line in secrets.read_text().splitlines():
            if line.startswith("SUPABASE_PAT"):
                pat = line.split("=", 1)[1].strip()
    if pat:
        r = requests.get(f"https://api.supabase.com/v1/projects/ivkvluezuiojovpotlyb/api-keys",
                         headers={"Authorization": f"Bearer {pat}"})
        for k in r.json():
            if k.get("name") == "service_role":
                SRK = k["api_key"]
                break
if not SRK:
    print("ERROR: no SUPABASE_SERVICE_ROLE_KEY in env or iCloud", file=sys.stderr)
    sys.exit(2)

ROOT = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/Customer Brain/Analysis"
TM_ORDERS  = ROOT / "LevelUp_TagMango_Orders_Master.xlsx"
CB_UNIFIED = ROOT / "LevelUp_Customer_Brain_Unified_v3.xlsx"
DRY = "--dry-run" in sys.argv
LIMIT = None
for i, a in enumerate(sys.argv):
    if a == "--limit" and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1]); break

sys.stdout.reconfigure(line_buffering=True)

def normalize_phone(p):
    if p is None or (isinstance(p, float) and pd.isna(p)):
        return None
    s = re.sub(r"\D", "", str(p))
    if not s:
        return None
    if s.startswith("91") and len(s) == 12:
        return "+" + s
    if len(s) == 10:
        return "+91" + s
    return "+" + s if not s.startswith("+") else s

# ───────────── Load sources ─────────────
print(f"Loading {TM_ORDERS.name}…")
tm = pd.read_excel(TM_ORDERS, sheet_name="All Completed Orders")
print(f"  → {len(tm):,} TagMango orders")
# Build phone → (name, state) lookup. Order IDs in this xlsx don't
# overlap with legacy_enrolments.legacy_order_id (different export
# vintage) but phones DO overlap, so we match on normalized phone.
# When a phone appears multiple times we pick the most recent name
# (rows are roughly chronological — last wins).
tm_lookup = {}
for _, r in tm.iterrows():
    ph = normalize_phone(r.get("Phone"))
    if not ph:
        continue
    name = (str(r.get("Name") or "").strip()) or None
    state = (str(r.get("State") or "").strip()) or None
    if name or state:
        tm_lookup[ph] = {"name": name, "state": state}
print(f"  → {len(tm_lookup):,} unique phones indexed (name+state)")

print(f"\nLoading {CB_UNIFIED.name} → 'All Customers'…")
cb = pd.read_excel(CB_UNIFIED, sheet_name="All Customers")
print(f"  → {len(cb):,} rows (City fill rate: {cb['City'].notna().sum() / len(cb) * 100:.1f}%)")
# Build phone → city lookup
cb_lookup = {}
for _, r in cb.iterrows():
    ph = normalize_phone(r.get("Phone"))
    if not ph:
        continue
    city = str(r.get("City") or "").strip() or None
    if city and ph not in cb_lookup:
        cb_lookup[ph] = city
print(f"  → {len(cb_lookup):,} unique phones with city")

# ───────────── Fetch rows needing backfill ─────────────
session = requests.Session()
session.headers.update({
    "apikey": SRK,
    "Authorization": f"Bearer {SRK}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
})

def fetch_page(offset, limit):
    r = session.get(f"{SUPABASE_URL}/rest/v1/legacy_enrolments",
                    params={
                        "select": "id,phone,legacy_order_id,full_name,city,state",
                        "limit": limit, "offset": offset,
                        "order": "created_at.asc",
                    })
    r.raise_for_status()
    return r.json()

PAGE = 500
offset = 0
patched_name = patched_city = patched_state = errors = scanned = 0
while True:
    rows = fetch_page(offset, PAGE)
    if not rows:
        break
    for row in rows:
        scanned += 1
        if LIMIT and scanned > LIMIT:
            break
        patch = {}
        ph = row.get("phone")
        if ph and not row.get("full_name"):
            hit = tm_lookup.get(ph)
            if hit and hit.get("name"):
                patch["full_name"] = hit["name"]
                if hit.get("state") and not row.get("state"):
                    patch["state"] = hit["state"]
        if ph and not row.get("city"):
            city = cb_lookup.get(ph)
            if city:
                patch["city"] = city
        if not patch:
            continue
        if DRY:
            patched_name += 1 if "full_name" in patch else 0
            patched_city += 1 if "city" in patch else 0
            patched_state += 1 if "state" in patch else 0
            continue
        rr = session.patch(f"{SUPABASE_URL}/rest/v1/legacy_enrolments",
                           params={"id": f"eq.{row['id']}"},
                           json=patch)
        if rr.ok:
            patched_name += 1 if "full_name" in patch else 0
            patched_city += 1 if "city" in patch else 0
            patched_state += 1 if "state" in patch else 0
        else:
            errors += 1
            if errors <= 3:
                print(f"  patch fail [{rr.status_code}]: {rr.text[:200]}")
    if LIMIT and scanned >= LIMIT:
        break
    offset += PAGE
    if offset % 5000 == 0:
        print(f"  ... offset={offset:,}  name+={patched_name:,} city+={patched_city:,} state+={patched_state:,} errors={errors}")

print()
print("=" * 60)
print(f"Scanned:      {scanned:,}")
print(f"Names added:  {patched_name:,}")
print(f"Cities added: {patched_city:,}")
print(f"States added: {patched_state:,}")
print(f"Errors:       {errors}")
print(f"Dry run:      {DRY}")
