// admin-update-user — admin/owner only. Edit a student's name / bio / email /
// phone in ONE place: auth.users (what OTP login checks) and public.users (the
// profile) together. All the logic — and its unit tests — live in handler.ts;
// this file is CORS, the actor gate, and the HTTP mapping.
//
// Business outcomes (validation, clashes, the legacy-purchase confirmation)
// are returned as data on HTTP 200: supabase-js turns any non-2xx into a
// generic "Edge Function returned a non-2xx status code" and the readable
// message would never reach the admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { updateUserContact, type UpdateBody } from "./handler.ts";

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    !!origin &&
    (origin.endsWith("leveluplearning.in") ||
      origin.startsWith("capacitor://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("https://localhost"));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.leveluplearning.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: actor } } = await sb.auth.getUser();
    if (!actor) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: actorRow } = await admin.from("users").select("role").eq("id", actor.id).single();
    if (actorRow?.role !== "admin" && actorRow?.role !== "owner") {
      return json({ error: "Forbidden — admins only" }, 403);
    }

    const body = (await req.json().catch(() => null)) as UpdateBody | null;
    const outcome = await updateUserContact(admin, { id: actor.id, role: actorRow.role }, body);
    return json(outcome, 200);
  } catch (e) {
    return json({ ok: false, code: "failed", error: `unexpected: ${String(e instanceof Error ? e.message : e)}` }, 500);
  }
});
