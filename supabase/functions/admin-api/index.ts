/**
 * admin-api — the single edge endpoint that powers the CLI + MCP.
 *
 * Surface (v1):
 *   - offerings.{list,get,create,update,archive}
 *   - courses.{list,get,create,update}
 *   - chapters.{list,create,update,delete,bulk_reorder}
 *   - events.{list,create,update}
 *   - enrolments.{list,grant,revoke}
 *   - users.{list,search}
 *   - revenue.{summary,by_offering}
 *   - cohorts.{weeks_list,weeks_create,weeks_update,members_list}
 *   - coupons.{list,create,toggle}
 *   - system.{whoami,ping,list_actions}
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type Scope = "read" | "write" | "admin";

interface Handler {
  scope: Scope;
  fn: (admin: any, params: any, ctx: HandlerCtx) => Promise<any>;
}

interface HandlerCtx {
  api_key_id: string;
  created_by: string;
  ip: string;
  user_agent: string;
}

const HANDLERS: Record<string, Handler> = {
  "system.ping": { scope: "read", fn: async () => ({ ok: true, time: new Date().toISOString() }) },
  "system.whoami": {
    scope: "read",
    fn: async (admin, _, ctx) => {
      const { data: key } = await admin.from("team_api_keys").select("id, name, scope, created_by, created_at, last_used_at").eq("id", ctx.api_key_id).single();
      const { data: user } = await admin.from("users").select("id, email, full_name, role").eq("id", ctx.created_by).single();
      return { key, user };
    },
  },
  "system.list_actions": { scope: "read", fn: async () => ({ actions: Object.keys(HANDLERS).sort() }) },

  /* offerings */
  "offerings.list": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 500);
      let q = admin.from("offerings").select("id, slug, title, subtitle, price_inr, mrp_inr, status, type, payment_mode, is_public, created_at").order("created_at", { ascending: false }).limit(limit);
      if (p?.status) q = q.eq("status", p.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { offerings: data, count: data?.length ?? 0 };
    },
  },
  "offerings.get": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.id && !p?.slug) throw new Error("id or slug required");
      const { data, error } = await (p.id
        ? admin.from("offerings").select("*").eq("id", p.id).maybeSingle()
        : admin.from("offerings").select("*").eq("slug", p.slug).maybeSingle());
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Not found");
      return { offering: data };
    },
  },
  "offerings.create": {
    scope: "write",
    fn: async (admin, p) => {
      for (const k of ["slug", "title", "type", "price_inr"]) if (p?.[k] == null) throw new Error(`${k} required`);
      const { data, error } = await admin.from("offerings").insert({
        slug: p.slug, title: p.title, subtitle: p.subtitle ?? null, description: p.description ?? null,
        type: p.type, price_inr: p.price_inr, mrp_inr: p.mrp_inr ?? null, currency: p.currency ?? "INR",
        status: p.status ?? "draft", is_public: p.is_public ?? false, instructor_name: p.instructor_name ?? null,
        payment_mode: p.payment_mode ?? "single", gst_mode: p.gst_mode ?? "inclusive",
      }).select().single();
      if (error) throw new Error(error.message);
      return { offering: data };
    },
  },
  "offerings.update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = {};
      const fields = ["slug","title","subtitle","description","type","price_inr","mrp_inr","status","is_public","instructor_name","payment_mode","gst_mode","gst_rate","thumbnail_url","banner_url","highlights","attendance_threshold_pct","refund_policy_days"];
      for (const f of fields) if (f in (p || {})) patch[f] = p[f];
      if (Object.keys(patch).length === 0) throw new Error("no fields to update");
      const { data, error } = await admin.from("offerings").update(patch).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { offering: data };
    },
  },
  "offerings.archive": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { data, error } = await admin.from("offerings").update({ status: "archived" }).eq("id", p.id).select("id, status").single();
      if (error) throw new Error(error.message);
      return { offering: data };
    },
  },

  /* courses */
  "courses.list": {
    scope: "read",
    fn: async (admin, p) => {
      const { data, error } = await admin.from("courses").select("id, slug, title, subtitle, created_at").order("created_at", { ascending: false }).limit(Math.min(p?.limit ?? 100, 500));
      if (error) throw new Error(error.message);
      return { courses: data };
    },
  },
  "courses.get": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.id && !p?.slug) throw new Error("id or slug required");
      const { data, error } = await (p.id
        ? admin.from("courses").select("*").eq("id", p.id).maybeSingle()
        : admin.from("courses").select("*").eq("slug", p.slug).maybeSingle());
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Not found");
      const { data: sections } = await admin.from("sections").select("id, title, sort_order").eq("course_id", data.id).order("sort_order");
      return { course: data, sections };
    },
  },
  "courses.create": {
    scope: "write",
    fn: async (admin, p) => {
      for (const k of ["slug", "title"]) if (!p?.[k]) throw new Error(`${k} required`);
      const { data, error } = await admin.from("courses").insert({ slug: p.slug, title: p.title, subtitle: p.subtitle ?? null, description: p.description ?? null }).select().single();
      if (error) throw new Error(error.message);
      return { course: data };
    },
  },
  "courses.update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = {};
      for (const f of ["slug","title","subtitle","description","thumbnail_url"]) if (f in p) patch[f] = p[f];
      if (Object.keys(patch).length === 0) throw new Error("no fields to update");
      const { data, error } = await admin.from("courses").update(patch).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { course: data };
    },
  },

  /* chapters */
  "chapters.list": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.course_id && !p?.section_id) throw new Error("course_id or section_id required");
      let q = admin.from("chapters").select("id, section_id, title, content_type, sort_order, media_url, media_provider, duration_seconds").order("sort_order");
      if (p.section_id) q = q.eq("section_id", p.section_id);
      else {
        const { data: secs } = await admin.from("sections").select("id").eq("course_id", p.course_id);
        q = q.in("section_id", (secs || []).map((s: any) => s.id));
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { chapters: data };
    },
  },
  "chapters.create": {
    scope: "write",
    fn: async (admin, p) => {
      for (const k of ["section_id", "title", "content_type"]) if (!p?.[k]) throw new Error(`${k} required`);
      const { data: last } = await admin.from("chapters").select("sort_order").eq("section_id", p.section_id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const sort = (last?.sort_order ?? 0) + 1;
      const { data, error } = await admin.from("chapters").insert({
        section_id: p.section_id, title: p.title, content_type: p.content_type,
        sort_order: p.sort_order ?? sort, media_url: p.media_url ?? null,
        media_provider: p.media_provider ?? null, vdocipher_video_id: p.vdocipher_video_id ?? null,
      }).select().single();
      if (error) throw new Error(error.message);
      return { chapter: data };
    },
  },
  "chapters.update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = {};
      for (const f of ["title","content_type","sort_order","media_url","media_provider","vdocipher_video_id","make_free","thumbnail_url"]) if (f in p) patch[f] = p[f];
      if (Object.keys(patch).length === 0) throw new Error("no fields to update");
      const { data, error } = await admin.from("chapters").update(patch).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { chapter: data };
    },
  },
  "chapters.delete": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { error } = await admin.from("chapters").delete().eq("id", p.id);
      if (error) throw new Error(error.message);
      return { deleted: true };
    },
  },
  "chapters.bulk_reorder": {
    scope: "write",
    fn: async (admin, p) => {
      const order = p?.order;
      if (!Array.isArray(order)) throw new Error("order array required: [{id, sort_order}, ...]");
      for (const row of order) {
        if (!row?.id || row.sort_order == null) throw new Error("each row needs id + sort_order");
        await admin.from("chapters").update({ sort_order: row.sort_order }).eq("id", row.id);
      }
      return { updated: order.length };
    },
  },

  /* events */
  "events.list": {
    scope: "read",
    fn: async (admin, p) => {
      const { data, error } = await admin.from("events").select("*").order("starts_at", { ascending: false }).limit(Math.min(p?.limit ?? 50, 200));
      if (error) throw new Error(error.message);
      return { events: data };
    },
  },
  "events.create": {
    scope: "write",
    fn: async (admin, p) => {
      for (const k of ["slug", "title", "starts_at"]) if (!p?.[k]) throw new Error(`${k} required`);
      const { data, error } = await admin.from("events").insert({
        slug: p.slug, title: p.title, description: p.description ?? null,
        starts_at: p.starts_at, ends_at: p.ends_at ?? null, location: p.location ?? null,
        is_paid: p.is_paid ?? false, price_inr: p.price_inr ?? 0,
        max_capacity: p.max_capacity ?? null, cover_image_url: p.cover_image_url ?? null,
        status: p.status ?? "draft",
      }).select().single();
      if (error) throw new Error(error.message);
      return { event: data };
    },
  },
  "events.update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = {};
      for (const f of ["slug","title","description","starts_at","ends_at","location","is_paid","price_inr","max_capacity","cover_image_url","status"]) if (f in p) patch[f] = p[f];
      if (Object.keys(patch).length === 0) throw new Error("no fields to update");
      const { data, error } = await admin.from("events").update(patch).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { event: data };
    },
  },

  /* enrolments */
  "enrolments.list": {
    scope: "read",
    fn: async (admin, p) => {
      let q = admin.from("enrolments").select("id, user_id, offering_id, status, source, total_paid_inr, created_at, expires_at, users:user_id(email, full_name), offerings:offering_id(title)").order("created_at", { ascending: false }).limit(Math.min(p?.limit ?? 100, 500));
      if (p?.user_id) q = q.eq("user_id", p.user_id);
      if (p?.offering_id) q = q.eq("offering_id", p.offering_id);
      if (p?.status) q = q.eq("status", p.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { enrolments: data };
    },
  },
  "enrolments.grant": {
    scope: "admin",
    fn: async (admin, p, ctx) => {
      if (!p?.user_id || !p?.offering_id) throw new Error("user_id and offering_id required");
      const { data: existing } = await admin.from("enrolments").select("id").eq("user_id", p.user_id).eq("offering_id", p.offering_id).eq("status", "active").maybeSingle();
      if (existing) return { enrolment: existing, already_existed: true };
      const { data, error } = await admin.from("enrolments").insert({
        user_id: p.user_id, offering_id: p.offering_id,
        status: "active", source: p.source ?? "manual", granted_by: ctx.created_by,
      }).select().single();
      if (error) throw new Error(error.message);
      return { enrolment: data };
    },
  },
  "enrolments.revoke": {
    scope: "admin",
    fn: async (admin, p, ctx) => {
      if (!p?.id) throw new Error("id required");
      const { data, error } = await admin.from("enrolments").update({
        status: "revoked", revoked_at: new Date().toISOString(),
        revoked_by: ctx.created_by, revoked_reason: p.reason ?? "Revoked via API",
      }).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { enrolment: data };
    },
  },

  /* users */
  "users.list": {
    scope: "read",
    fn: async (admin, p) => {
      let q = admin.from("users").select("id, email, phone, full_name, role, member_number, created_at, last_active_at").order("created_at", { ascending: false }).limit(Math.min(p?.limit ?? 50, 200));
      if (p?.role) q = q.eq("role", p.role);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { users: data };
    },
  },
  "users.search": {
    scope: "read",
    fn: async (admin, p) => {
      const term = (p?.q || "").trim();
      if (term.length < 2) throw new Error("q must be at least 2 chars");
      const { data, error } = await admin.from("users")
        .select("id, email, phone, full_name, role, member_number")
        .or(`email.ilike.%${term}%,full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(Math.min(p?.limit ?? 20, 100));
      if (error) throw new Error(error.message);
      return { users: data };
    },
  },

  /* revenue */
  "revenue.summary": {
    scope: "read",
    fn: async (admin, p) => {
      const days = Math.min(p?.days ?? 30, 365);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { data } = await admin.from("payment_orders").select("total_inr, status, captured_at").gte("created_at", since);
      const captured = (data || []).filter((r: any) => r.status === "captured");
      const refunded = (data || []).filter((r: any) => r.status === "refunded");
      const gross = captured.reduce((s: number, r: any) => s + Number(r.total_inr), 0);
      const refunds = refunded.reduce((s: number, r: any) => s + Number(r.total_inr), 0);
      return {
        period_days: days, order_count: data?.length || 0,
        captured_count: captured.length, refunded_count: refunded.length,
        gross_revenue_inr: gross, refunded_inr: refunds, net_revenue_inr: gross - refunds,
      };
    },
  },
  "revenue.by_offering": {
    scope: "read",
    fn: async (admin, p) => {
      const days = Math.min(p?.days ?? 30, 365);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { data } = await admin.from("payment_orders")
        .select("offering_id, total_inr, status, offerings:offering_id(title, slug)")
        .gte("created_at", since).eq("status", "captured");
      const map: Record<string, any> = {};
      for (const row of (data || []) as any[]) {
        const key = row.offering_id;
        if (!map[key]) map[key] = { offering_id: row.offering_id, title: row.offerings?.title ?? "(unknown)", slug: row.offerings?.slug ?? "(unknown)", revenue_inr: 0, orders: 0 };
        map[key].revenue_inr += Number(row.total_inr);
        map[key].orders += 1;
      }
      return { period_days: days, by_offering: Object.values(map).sort((a: any, b: any) => b.revenue_inr - a.revenue_inr) };
    },
  },

  /* cohorts */
  "cohorts.weeks_list": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.batch_id) throw new Error("batch_id required");
      const { data, error } = await admin.from("cohort_weeks").select("*").eq("cohort_batch_id", p.batch_id).order("week_number");
      if (error) throw new Error(error.message);
      return { weeks: data };
    },
  },
  "cohorts.weeks_create": {
    scope: "write",
    fn: async (admin, p) => {
      for (const k of ["cohort_batch_id", "week_number", "theme", "starts_on", "ends_on"]) if (!p?.[k]) throw new Error(`${k} required`);
      const { data, error } = await admin.from("cohort_weeks").insert({
        cohort_batch_id: p.cohort_batch_id, week_number: p.week_number, theme: p.theme,
        description: p.description ?? null, starts_on: p.starts_on, ends_on: p.ends_on,
        assignment_prompt: p.assignment_prompt ?? null, assignment_due_at: p.assignment_due_at ?? null,
        feedback_session_at: p.feedback_session_at ?? null, status: p.status ?? "upcoming",
      }).select().single();
      if (error) throw new Error(error.message);
      return { week: data };
    },
  },
  "cohorts.weeks_update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = {};
      for (const f of ["theme","description","starts_on","ends_on","assignment_prompt","assignment_due_at","feedback_session_at","status"]) if (f in p) patch[f] = p[f];
      const { data, error } = await admin.from("cohort_weeks").update(patch).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { week: data };
    },
  },
  "cohorts.members_list": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.batch_id) throw new Error("batch_id required");
      const { data, error } = await admin.from("cohort_batch_members")
        .select("id, enrolment_id, added_at, enrolments:enrolment_id(user_id, users:user_id(email, full_name))")
        .eq("batch_id", p.batch_id);
      if (error) throw new Error(error.message);
      const flat = (data || []).map((m: any) => ({
        member_id: m.id, enrolment_id: m.enrolment_id,
        user_id: m.enrolments?.user_id, email: m.enrolments?.users?.email,
        full_name: m.enrolments?.users?.full_name, added_at: m.added_at,
      }));
      return { members: flat };
    },
  },

  /* coupons */
  "coupons.list": {
    scope: "read",
    fn: async (admin, p) => {
      const { data, error } = await admin.from("coupons").select("*").order("created_at", { ascending: false }).limit(p?.limit ?? 100);
      if (error) throw new Error(error.message);
      return { coupons: data };
    },
  },
  "coupons.create": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.code) throw new Error("code required");
      const { data, error } = await admin.from("coupons").insert({
        code: p.code, kind: p.kind ?? "percentage", value: p.value ?? 10,
        max_uses: p.max_uses ?? null, valid_until: p.valid_until ?? null,
        is_active: p.is_active ?? true,
      }).select().single();
      if (error) throw new Error(error.message);
      return { coupon: data };
    },
  },
  "coupons.toggle": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { data: cur } = await admin.from("coupons").select("is_active").eq("id", p.id).single();
      const { data, error } = await admin.from("coupons").update({ is_active: !cur?.is_active }).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { coupon: data };
    },
  },
};

const SCOPE_RANK: Record<Scope, number> = { read: 1, write: 2, admin: 3 };

Deno.serve(async (req) => {
  const start = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";
  const userAgent = req.headers.get("user-agent") ?? "";

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return jsonRes({ error: "Missing Bearer token" }, 401);
  const plaintext = authHeader.slice(7).trim();
  const { data: keyRows } = await admin.rpc("verify_team_api_key", { p_plaintext: plaintext });
  const keyRow = (keyRows as any[])?.[0];
  if (!keyRow) return jsonRes({ error: "Invalid or revoked API key" }, 401);
  const ctx: HandlerCtx = { api_key_id: keyRow.key_id, created_by: keyRow.created_by, ip, user_agent: userAgent };

  // Fire-and-forget last_used tracking
  admin.from("team_api_keys").update({ last_used_at: new Date().toISOString(), last_used_ip: ip || null }).eq("id", keyRow.key_id).then(() => {}, () => {});

  // Body + action
  let body: any;
  try { body = await req.json(); } catch { return jsonRes({ error: "Body must be JSON" }, 400); }
  const action = body?.action as string;
  const params = body?.params ?? {};
  if (!action || typeof action !== "string") return jsonRes({ error: "action required" }, 400);

  const handler = HANDLERS[action];
  if (!handler) return jsonRes({ error: `Unknown action: ${action}`, hint: "Try system.list_actions" }, 404);

  if (SCOPE_RANK[keyRow.scope as Scope] < SCOPE_RANK[handler.scope]) {
    return jsonRes({ error: `Insufficient scope`, required: handler.scope, your_scope: keyRow.scope }, 403);
  }

  let status = 200, result: any, errorMsg: string | null = null;
  try {
    result = await handler.fn(admin, params, ctx);
  } catch (e) {
    status = 400;
    errorMsg = e instanceof Error ? e.message : String(e);
    result = { error: errorMsg };
  }

  admin.from("api_call_log").insert({
    api_key_id: ctx.api_key_id, action, status_code: status, duration_ms: Date.now() - start,
    ip: ip || null, user_agent: userAgent || null, request_body: params,
    response_summary: status === 200 ? { ok: true, keys: result ? Object.keys(result) : [] } : null,
    error_message: errorMsg,
  }).then(() => {}, () => {});

  return jsonRes(result, status);
});
