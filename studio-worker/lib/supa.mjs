// Thin Supabase REST helper for the LevelUp project (service-role, server-side
// only). The worker + capture run as trusted server code; per-row tenancy is
// enforced by always writing/reading with an explicit user_id, never by trusting
// the caller. (User-facing reads go through RLS elsewhere, not this helper.)
const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sb(pathAndQuery, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`supabase ${res.status}: ${String(text).slice(0, 240)}`);
  return data;
}
