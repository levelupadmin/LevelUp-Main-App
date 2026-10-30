/**
 * tagmango-sync — pull masterclass buyers from TagMango every 15 minutes so
 * they get access without waiting for someone to upload a spreadsheet.
 *
 * WHY
 * Masterclasses are sold and fulfilled on TagMango, not through this app's
 * Razorpay checkout, and nothing carried the purchase across. Access existed
 * only after a manual CSV import. The last one ran 2026-05-24, so every
 * masterclass sold after that date had no route into the app: 2,041 buyers
 * across three masterclasses, 18 of whom could actually watch anything.
 *
 * WHAT IT DOES
 *   1. GET the creator's full subscriber list (one call, all 67k).
 *   2. Record every mango (TagMango's per-batch product) it saw. New batches
 *      land as 'pending' and grant NOTHING until mapped.
 *   3. Name any mango we have not seen before, a bounded few per run.
 *   4. Auto-map by title against legacy_program_mapping — the same list a
 *      human vetted during the May migration.
 *   5. Write buyers of mapped mangoes into legacy_enrolments.
 *   6. Sweep: grant to buyers whose account already existed.
 *
 * The grant path is entirely the existing legacy machinery — the claim trigger
 * and legacy_enrolments. This function only keeps that table current.
 *
 * TAGMANGO IS READ-ONLY. Standing instruction: never call a write or mutation
 * endpoint, never change settings there. This function issues two GETs and
 * nothing else. Keep it that way.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TM_TOKEN = Deno.env.get("TAGMANGO_API_TOKEN") || "";
const TM_HOST = Deno.env.get("TAGMANGO_WHITELABEL_HOST") || "study.leveluplearning.in";
const TM_CREATOR = Deno.env.get("TAGMANGO_CREATOR_ID") || "";
const TM_BASE = "https://api-prod-new.tagmango.com";

/** Name at most this many new mangoes per run; the rest wait for the next. */
const TITLE_LOOKUPS_PER_RUN = 20;
/** Rows per ingest call. Keeps each statement small and the payload bounded. */
const INGEST_CHUNK = 1000;
/** Stop starting new work past this point so a run cannot overrun its slot. */
const SOFT_BUDGET_MS = 110_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function tmHeaders() {
  return {
    Authorization: `Bearer ${TM_TOKEN}`,
    "x-whitelabel-host": TM_HOST,
  };
}

/** Supabase PostgREST RPC via fetch — avoids pulling the JS client for four calls. */
async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function rest(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`rest ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

/**
 * TagMango stores phone as a bare number plus a separate dialCode. Build the
 * same E.164 shape legacy_enrolments already holds (+91XXXXXXXXXX) so the
 * claim trigger's phone matching lines up.
 */
function toE164(phone: unknown, dialCode: unknown): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const dial = String(dialCode ?? "").replace(/\D/g, "") || "91";
  // Some rows already carry the country code in the phone field.
  if (digits.length > 10 && digits.startsWith(dial)) return `+${digits}`;
  return `+${dial}${digits}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Only the cron job (which carries a service-role credential) may run this.
  // It reads every buyer's contact details, so it is not a public endpoint.
  //
  // Accept either an exact match on the injected key or any token whose JWT
  // role claim is service_role. The platform injects different key formats
  // depending on project vintage (legacy JWT vs sb_secret_*), and the cron job
  // reads its own copy from vault, so an equality check alone locks the job
  // out the moment those two drift.
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const isServiceRole = (() => {
    if (!bearer) return false;
    if (SERVICE_ROLE_KEY && bearer === SERVICE_ROLE_KEY) return true;
    try {
      const seg = bearer.split(".")[1];
      if (!seg) return false;
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(seg.length / 4) * 4, "=");
      return JSON.parse(atob(b64))?.role === "service_role";
    } catch {
      return false;
    }
  })();
  if (!isServiceRole) return json({ error: "unauthorized" }, 401);

  if (!TM_TOKEN || !TM_CREATOR) {
    console.error("[tagmango-sync] TAGMANGO_API_TOKEN or TAGMANGO_CREATOR_ID not set");
    return json({ error: "tagmango_not_configured" }, 500);
  }

  const started = Date.now();
  let body: { dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }
  const dryRun = body?.dry_run === true;

  // Open a run row first so a crash still leaves a trace.
  const [run] = await rest("tagmango_sync_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "running", dry_run: dryRun }),
  });

  const finish = async (patch: Record<string, unknown>) => {
    await rest(`tagmango_sync_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({ finished_at: new Date().toISOString(), ...patch }),
    });
  };

  try {
    /* ── 1. Full subscriber list ───────────────────────────────────── */
    const subsRes = await fetch(
      `${TM_BASE}/api/v1/external/subscriptions/subscribers-by-creator/${TM_CREATOR}`,
      { headers: tmHeaders() },
    );
    if (!subsRes.ok) throw new Error(`TagMango subscribers ${subsRes.status}`);
    const subscribers: any[] = (await subsRes.json())?.result ?? [];
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      // An empty list is far more likely to be an API hiccup than every
      // customer vanishing. Do nothing rather than act on it.
      await finish({ status: "skipped", subscribers_seen: 0, error: "empty subscriber list" });
      return json({ ok: true, skipped: "empty subscriber list" });
    }

    /* ── 2. Record every mango seen ────────────────────────────────── */
    const counts = new Map<string, number>();
    for (const s of subscribers) {
      for (const m of s.subscribedMangoes || []) counts.set(m, (counts.get(m) || 0) + 1);
    }
    const upsertRes = await rpc("tagmango_upsert_mangoes", {
      p_mangoes: [...counts].map(([mango_id, subscriber_count]) => ({ mango_id, subscriber_count })),
    });
    const newMangoes = (Array.isArray(upsertRes) ? upsertRes[0]?.inserted : upsertRes?.inserted) ?? 0;

    /* ── 3. Name the ones we have never seen ───────────────────────── */
    // TagMango gives no bulk "list my mangoes" endpoint, but the per-user
    // subscription detail returns full mango objects. One call names every
    // mango that subscriber holds, so a handful of calls covers a batch of
    // new products. Bounded per run to keep the job short.
    const unnamed: { mango_id: string }[] = await rest(
      "tagmango_mangoes?title=is.null&select=mango_id&order=subscriber_count.desc&limit=" +
        TITLE_LOOKUPS_PER_RUN,
    );
    let titlesResolved = 0;
    if (unnamed.length > 0) {
      const wanted = new Set(unnamed.map((u) => u.mango_id));
      const found: Record<string, { title?: string; price?: number }> = {};
      for (const s of subscribers) {
        if (wanted.size === 0 || Date.now() - started > SOFT_BUDGET_MS) break;
        const holds = (s.subscribedMangoes || []).filter((m: string) => wanted.has(m));
        if (holds.length === 0) continue;
        try {
          const r = await fetch(`${TM_BASE}/api/v1/external/subscriptions/${s._id}`, {
            headers: tmHeaders(),
          });
          if (!r.ok) continue;
          for (const sub of (await r.json())?.result ?? []) {
            const m = sub?.mango;
            if (m?._id && wanted.has(m._id)) {
              found[m._id] = { title: m.title, price: m.inrAmount ?? m.price };
              wanted.delete(m._id);
            }
          }
        } catch (err) {
          console.warn("[tagmango-sync] title lookup failed:", err);
        }
        // Whatever this subscriber could not explain, no other holder will
        // either — drop them so we don't loop over the same gap forever.
        for (const m of holds) wanted.delete(m);
      }
      const namedRows = Object.entries(found).map(([mango_id, v]) => ({
        mango_id,
        title: v.title ?? null,
        price: v.price ?? null,
        subscriber_count: counts.get(mango_id) ?? 0,
      }));
      if (namedRows.length > 0) {
        await rpc("tagmango_upsert_mangoes", { p_mangoes: namedRows });
        titlesResolved = namedRows.length;
      }
    }

    /* ── 4. Auto-map titles against the vetted migration mapping ───── */
    const autoMapped = dryRun ? 0 : await rpc("tagmango_auto_map_mangoes", {});

    /* ── 5. Buyers of mapped mangoes → legacy_enrolments ───────────── */
    const mapped: { mango_id: string }[] = await rest(
      "tagmango_mangoes?decision_status=eq.mapped&offering_id=not.is.null&select=mango_id",
    );
    const mappedIds = new Set(mapped.map((m) => m.mango_id));

    const rows: Record<string, unknown>[] = [];
    for (const s of subscribers) {
      const holds = (s.subscribedMangoes || []).filter((m: string) => mappedIds.has(m));
      if (holds.length === 0) continue;
      const phone = toE164(s.phone, s.dialCode);
      if (!phone) continue;
      for (const mango_id of holds) {
        rows.push({
          phone,
          email: s.email ?? null,
          full_name: s.name ?? null,
          mango_id,
        });
      }
    }

    let legacyAdded = 0;
    if (!dryRun) {
      for (let i = 0; i < rows.length; i += INGEST_CHUNK) {
        if (Date.now() - started > SOFT_BUDGET_MS) {
          console.warn("[tagmango-sync] soft budget hit; remaining rows resume next run");
          break;
        }
        legacyAdded += await rpc("tagmango_ingest_subscriptions", {
          p_rows: rows.slice(i, i + INGEST_CHUNK),
        });
      }
    }

    /* ── 6. Grant to buyers who already had an account ─────────────── */
    let granted = 0;
    if (!dryRun) {
      const sweep = await rpc("claim_legacy_enrolments_sweep", { p_limit: 5000 });
      granted = (Array.isArray(sweep) ? sweep[0]?.granted : sweep?.granted) ?? 0;
    }

    await finish({
      status: "ok",
      subscribers_seen: subscribers.length,
      mangoes_seen: counts.size,
      new_mangoes: newMangoes,
      titles_resolved: titlesResolved,
      auto_mapped: autoMapped,
      legacy_rows_added: legacyAdded,
      enrolments_granted: granted,
    });

    return json({
      ok: true,
      dry_run: dryRun,
      subscribers: subscribers.length,
      mangoes: counts.size,
      new_mangoes: newMangoes,
      titles_resolved: titlesResolved,
      auto_mapped: autoMapped,
      candidate_rows: rows.length,
      legacy_rows_added: legacyAdded,
      enrolments_granted: granted,
      ms: Date.now() - started,
    });
  } catch (err: any) {
    console.error("[tagmango-sync] failed:", err?.message || err);
    await finish({ status: "failed", error: String(err?.message || err).slice(0, 800) });
    return json({ error: String(err?.message || err) }, 500);
  }
});
