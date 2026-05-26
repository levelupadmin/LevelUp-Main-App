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

  /* ───────── user_tags ───────── */
  "users.list_tags": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.user_id) throw new Error("user_id required");
      const { data, error } = await admin.from("user_tags").select("id, tag, value, source, created_by, created_at").eq("user_id", p.user_id).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { tags: data };
    },
  },
  "users.tag": {
    scope: "write",
    fn: async (admin, p, ctx) => {
      if (!p?.user_id || !p?.tag) throw new Error("user_id and tag required");
      const { data, error } = await admin.from("user_tags").upsert({
        user_id: p.user_id, tag: p.tag, value: p.value ?? null,
        source: p.source ?? "api", created_by: ctx.created_by,
      }, { onConflict: "user_id,tag" }).select().single();
      if (error) throw new Error(error.message);
      return { tag: data };
    },
  },
  "users.untag": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.user_id || !p?.tag) throw new Error("user_id and tag required");
      const { error, count } = await admin.from("user_tags").delete({ count: "exact" }).eq("user_id", p.user_id).eq("tag", p.tag);
      if (error) throw new Error(error.message);
      return { removed: count };
    },
  },
  "users.list_by_tag": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.tag) throw new Error("tag required");
      const limit = Math.min(p?.limit ?? 200, 1000);
      const { data, error } = await admin.from("user_tags")
        .select("user_id, value, created_at, users:user_id(email, phone, full_name, role)")
        .eq("tag", p.tag).order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      const flat = (data || []).map((r: any) => ({
        user_id: r.user_id, value: r.value, tagged_at: r.created_at,
        email: r.users?.email, phone: r.users?.phone, full_name: r.users?.full_name, role: r.users?.role,
      }));
      return { users: flat, count: flat.length };
    },
  },
  "users.bulk_tag": {
    scope: "write",
    fn: async (admin, p, ctx) => {
      if (!Array.isArray(p?.user_ids) || !p?.tag) throw new Error("user_ids[] and tag required");
      const rows = p.user_ids.map((uid: string) => ({
        user_id: uid, tag: p.tag, value: p.value ?? null,
        source: p.source ?? "api", created_by: ctx.created_by,
      }));
      const { data, error } = await admin.from("user_tags").upsert(rows, { onConflict: "user_id,tag" }).select("id");
      if (error) throw new Error(error.message);
      return { tagged: data?.length ?? 0 };
    },
  },

  /* ───────── user_notes ───────── */
  "users.list_notes": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.user_id) throw new Error("user_id required");
      const { data, error } = await admin.from("user_notes")
        .select("id, body, source, created_by, created_at, updated_at")
        .eq("user_id", p.user_id).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { notes: data };
    },
  },
  "users.add_note": {
    scope: "write",
    fn: async (admin, p, ctx) => {
      if (!p?.user_id || !p?.body) throw new Error("user_id and body required");
      const { data, error } = await admin.from("user_notes").insert({
        user_id: p.user_id, body: p.body,
        source: p.source ?? "api", created_by: ctx.created_by,
      }).select().single();
      if (error) throw new Error(error.message);
      return { note: data };
    },
  },
  "users.delete_note": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { error } = await admin.from("user_notes").delete().eq("id", p.id);
      if (error) throw new Error(error.message);
      return { deleted: true };
    },
  },

  /* ───────── user_marketing_prefs ───────── */
  "users.get_prefs": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.user_id) throw new Error("user_id required");
      const { data, error } = await admin.from("user_marketing_prefs").select("*").eq("user_id", p.user_id).maybeSingle();
      if (error) throw new Error(error.message);
      return { prefs: data };
    },
  },
  "users.set_prefs": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.user_id) throw new Error("user_id required");
      const fields: Record<string, any> = { user_id: p.user_id };
      for (const k of ["email_opt_in","whatsapp_opt_in","sms_opt_in","source","utm_source","utm_medium","utm_campaign","utm_term","utm_content","crm_id","consent_at","unsubscribed_at","custom_fields"]) {
        if (p[k] !== undefined) fields[k] = p[k];
      }
      const { data, error } = await admin.from("user_marketing_prefs").upsert(fields, { onConflict: "user_id" }).select().single();
      if (error) throw new Error(error.message);
      return { prefs: data };
    },
  },
  "users.opt_out": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.user_id) throw new Error("user_id required");
      const { data, error } = await admin.from("user_marketing_prefs").upsert({
        user_id: p.user_id, email_opt_in: false, whatsapp_opt_in: false, sms_opt_in: false,
        unsubscribed_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).select().single();
      if (error) throw new Error(error.message);
      return { prefs: data };
    },
  },

  /* ───────── user export (paginated, CRM-grade) ───────── */
  "users.export": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 500, 2000);
      let q = admin.from("users")
        .select("id, email, phone, full_name, role, created_at, member_number")
        .order("created_at", { ascending: false }).limit(limit);
      if (p?.cursor) q = q.lt("created_at", p.cursor);
      if (p?.role) q = q.eq("role", p.role);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const ids = (data || []).map((u: any) => u.id);
      // hydrate prefs + tags in batch
      const [{ data: prefs }, { data: tags }] = await Promise.all([
        admin.from("user_marketing_prefs").select("*").in("user_id", ids),
        admin.from("user_tags").select("user_id, tag, value").in("user_id", ids),
      ]);
      const prefMap = new Map((prefs || []).map((r: any) => [r.user_id, r]));
      const tagMap = new Map<string, Array<{ tag: string; value: string | null }>>();
      for (const t of (tags || []) as any[]) {
        const arr = tagMap.get(t.user_id) ?? [];
        arr.push({ tag: t.tag, value: t.value });
        tagMap.set(t.user_id, arr);
      }
      const out = (data || []).map((u: any) => ({
        ...u, prefs: prefMap.get(u.id) ?? null, tags: tagMap.get(u.id) ?? [],
      }));
      const nextCursor = out.length === limit ? out[out.length - 1].created_at : null;
      return { users: out, count: out.length, next_cursor: nextCursor };
    },
  },

  /* ───────── crm_contacts (leads) ───────── */
  "leads.list": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 1000);
      let q = admin.from("crm_contacts").select("*").order("created_at", { ascending: false }).limit(limit);
      if (p?.cursor) q = q.lt("created_at", p.cursor);
      if (p?.status) q = q.eq("status", p.status);
      if (p?.source) q = q.eq("source", p.source);
      if (p?.utm_campaign) q = q.eq("utm_campaign", p.utm_campaign);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const nextCursor = (data?.length ?? 0) === limit ? data![data!.length - 1].created_at : null;
      return { leads: data, count: data?.length ?? 0, next_cursor: nextCursor };
    },
  },
  "leads.get": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { data, error } = await admin.from("crm_contacts").select("*").eq("id", p.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Not found");
      return { lead: data };
    },
  },
  "leads.search": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.q) throw new Error("q required");
      const q = String(p.q).trim();
      const { data, error } = await admin.from("crm_contacts").select("*")
        .or(`email.ilike.%${q}%,phone.ilike.%${q}%,full_name.ilike.%${q}%,crm_id.eq.${q}`)
        .order("created_at", { ascending: false }).limit(Math.min(p?.limit ?? 50, 500));
      if (error) throw new Error(error.message);
      return { leads: data, count: data?.length ?? 0 };
    },
  },
  "leads.create": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.email && !p?.phone) throw new Error("email or phone required");
      // idempotent — use lead_capture RPC so callers can replay safely
      const { data: id, error } = await admin.rpc("lead_capture", {
        p_email: p.email ?? null, p_phone: p.phone ?? null,
        p_full_name: p.full_name ?? null, p_source: p.source ?? null,
        p_utm: p.utm ?? {}, p_custom_fields: p.custom_fields ?? {},
      });
      if (error) throw new Error(error.message);
      const { data } = await admin.from("crm_contacts").select("*").eq("id", id).single();
      return { lead: data };
    },
  },
  "leads.update": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const fields: Record<string, any> = {};
      for (const k of ["email","phone","full_name","source","status","owner_user_id","utm_source","utm_medium","utm_campaign","utm_term","utm_content","tags","custom_fields","notes","crm_id","last_contacted_at"]) {
        if (p[k] !== undefined) fields[k] = p[k];
      }
      const { data, error } = await admin.from("crm_contacts").update(fields).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { lead: data };
    },
  },
  "leads.convert": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.id || !p?.user_id) throw new Error("id and user_id required");
      const { data, error } = await admin.from("crm_contacts").update({
        status: "converted", converted_user_id: p.user_id, converted_at: new Date().toISOString(),
      }).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { lead: data };
    },
  },
  "leads.bulk_import": {
    scope: "write",
    fn: async (admin, p) => {
      if (!Array.isArray(p?.leads)) throw new Error("leads[] required");
      const created: string[] = [];
      for (const l of p.leads) {
        const { data: id, error } = await admin.rpc("lead_capture", {
          p_email: l.email ?? null, p_phone: l.phone ?? null,
          p_full_name: l.full_name ?? null, p_source: l.source ?? p.source ?? null,
          p_utm: l.utm ?? {}, p_custom_fields: l.custom_fields ?? {},
        });
        if (!error && id) created.push(id as string);
      }
      return { created: created.length, ids: created };
    },
  },

  /* ───────── payments / orders ───────── */
  "payments.list": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 1000);
      let q = admin.from("payment_orders")
        .select("id, user_id, offering_id, amount_inr, status, razorpay_order_id, razorpay_payment_id, created_at, captured_at")
        .order("created_at", { ascending: false }).limit(limit);
      if (p?.cursor) q = q.lt("created_at", p.cursor);
      if (p?.status) q = q.eq("status", p.status);
      if (p?.user_id) q = q.eq("user_id", p.user_id);
      if (p?.from) q = q.gte("created_at", p.from);
      if (p?.to) q = q.lte("created_at", p.to);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const nextCursor = (data?.length ?? 0) === limit ? data![data!.length - 1].created_at : null;
      return { payments: data, count: data?.length ?? 0, next_cursor: nextCursor };
    },
  },
  "payments.get": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.id && !p?.razorpay_payment_id) throw new Error("id or razorpay_payment_id required");
      const q = p.id
        ? admin.from("payment_orders").select("*").eq("id", p.id).maybeSingle()
        : admin.from("payment_orders").select("*").eq("razorpay_payment_id", p.razorpay_payment_id).maybeSingle();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { payment: data };
    },
  },

  /* ───────── campaigns (email + WhatsApp) ───────── */
  "campaigns.email_templates_list": {
    scope: "read",
    fn: async (admin) => {
      const { data, error } = await admin.from("email_templates").select("key, name, subject, html_body, is_active, updated_at").order("name");
      if (error) throw new Error(error.message);
      return { templates: data };
    },
  },
  "campaigns.email_send_one": {
    scope: "write",
    fn: async (admin, p) => {
      if (!p?.template_key || !p?.to) throw new Error("template_key and to required");
      const { data, error } = await admin.from("email_queue").insert({
        template_key: p.template_key, to_email: p.to, to_name: p.to_name ?? null,
        merge_vars: p.merge_vars ?? {}, status: "pending", priority: p.priority ?? 5,
      }).select().single();
      if (error) throw new Error(error.message);
      return { queued: data };
    },
  },
  "campaigns.email_send_bulk": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.template_key || !Array.isArray(p?.recipients)) throw new Error("template_key and recipients[] required");
      const rows = p.recipients.map((r: any) => ({
        template_key: p.template_key,
        to_email: r.email, to_name: r.name ?? null,
        merge_vars: r.merge_vars ?? p.merge_vars ?? {},
        status: "pending", priority: p.priority ?? 5,
      }));
      const { data, error } = await admin.from("email_queue").insert(rows).select("id");
      if (error) throw new Error(error.message);
      return { queued: data?.length ?? 0 };
    },
  },
  "campaigns.email_history": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 1000);
      let q = admin.from("email_queue").select("id, template_key, to_email, status, sent_at, error_message, created_at").order("created_at", { ascending: false }).limit(limit);
      if (p?.status) q = q.eq("status", p.status);
      if (p?.to) q = q.eq("to_email", p.to);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { emails: data };
    },
  },

  /* ───────── webhooks ───────── */
  "webhooks.list": {
    scope: "read",
    fn: async (admin) => {
      const { data, error } = await admin.from("webhook_subscriptions")
        .select("id, name, url, event_types, active, description, last_triggered_at, failure_count, last_failure_at, last_failure_reason, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { webhooks: data };
    },
  },
  "webhooks.create": {
    scope: "admin",
    fn: async (admin, p, ctx) => {
      if (!p?.name || !p?.url || !Array.isArray(p?.event_types)) throw new Error("name, url, event_types[] required");
      // Generate a signing secret if not provided
      const secret = p.secret ?? "whk_" + crypto.getRandomValues(new Uint8Array(24)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const { data, error } = await admin.from("webhook_subscriptions").insert({
        name: p.name, url: p.url, secret, event_types: p.event_types,
        active: p.active ?? true, description: p.description ?? null, created_by: ctx.created_by,
      }).select().single();
      if (error) throw new Error(error.message);
      return { webhook: data, secret };
    },
  },
  "webhooks.update": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const fields: Record<string, any> = {};
      for (const k of ["name","url","event_types","active","description"]) {
        if (p[k] !== undefined) fields[k] = p[k];
      }
      const { data, error } = await admin.from("webhook_subscriptions").update(fields).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { webhook: data };
    },
  },
  "webhooks.delete": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { error } = await admin.from("webhook_subscriptions").delete().eq("id", p.id);
      if (error) throw new Error(error.message);
      return { deleted: true };
    },
  },
  "webhooks.test": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { data: sub } = await admin.from("webhook_subscriptions").select("*").eq("id", p.id).single();
      if (!sub) throw new Error("Not found");
      const payload = { event_type: "webhook.test", payload: { sent_at: new Date().toISOString(), note: "test ping from admin-api" } };
      const { data, error } = await admin.from("webhook_deliveries").insert({
        subscription_id: sub.id, event_type: "webhook.test", payload, status: "pending", next_retry_at: new Date().toISOString(),
      }).select().single();
      if (error) throw new Error(error.message);
      // Try delivering synchronously so the caller gets immediate feedback
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-LevelUp-Event": "webhook.test", "X-LevelUp-Signature": sub.secret },
          body: JSON.stringify(payload),
        });
        await admin.from("webhook_deliveries").update({
          status: res.ok ? "delivered" : "failed", http_status: res.status,
          delivered_at: res.ok ? new Date().toISOString() : null, attempts: 1,
          response_excerpt: (await res.text().catch(() => "")).slice(0, 500),
        }).eq("id", data.id);
        return { delivered: res.ok, http_status: res.status, delivery_id: data.id };
      } catch (e) {
        await admin.from("webhook_deliveries").update({
          status: "failed", attempts: 1, error_message: String(e),
        }).eq("id", data.id);
        return { delivered: false, error: String(e), delivery_id: data.id };
      }
    },
  },
  "webhooks.deliveries": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 1000);
      let q = admin.from("webhook_deliveries")
        .select("id, subscription_id, event_type, status, http_status, attempts, delivered_at, error_message, created_at")
        .order("created_at", { ascending: false }).limit(limit);
      if (p?.subscription_id) q = q.eq("subscription_id", p.subscription_id);
      if (p?.status) q = q.eq("status", p.status);
      if (p?.event_type) q = q.eq("event_type", p.event_type);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { deliveries: data };
    },
  },
  "webhooks.event_types": {
    scope: "read",
    fn: async () => ({
      event_types: [
        { type: "user.created", description: "A new user account is created (signup or admin grant)" },
        { type: "enrolment.granted", description: "A user is enrolled in an offering (purchase or admin grant)" },
        { type: "crm_contact.created", description: "A new lead lands in crm_contacts (ad form, lead_capture RPC)" },
        { type: "crm_contact.converted", description: "A lead is converted to a paying user" },
        { type: "webhook.test", description: "Manual test ping from /admin/api" },
      ],
    }),
  },

  /* ───────── api keys (eat our own dog food) ───────── */
  "keys.list": {
    scope: "admin",
    fn: async (admin) => {
      const { data, error } = await admin.from("team_api_keys")
        .select("id, name, scope, key_hint, created_by, last_used_at, last_used_ip, revoked_at, expires_at, created_at, users:created_by(email, full_name)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const flat = (data || []).map((k: any) => ({
        id: k.id, name: k.name, scope: k.scope, key_hint: `…${k.key_hint}`,
        owner_email: k.users?.email, owner_name: k.users?.full_name,
        last_used_at: k.last_used_at, last_used_ip: k.last_used_ip,
        revoked_at: k.revoked_at, expires_at: k.expires_at, created_at: k.created_at,
        status: k.revoked_at ? "revoked" : (k.expires_at && new Date(k.expires_at) < new Date() ? "expired" : "active"),
      }));
      return { keys: flat };
    },
  },
  "keys.create": {
    scope: "admin",
    fn: async (admin, p, ctx) => {
      if (!p?.name || !p?.scope) throw new Error("name and scope required");
      if (!["read","write","admin"].includes(p.scope)) throw new Error("scope must be read|write|admin");
      const { data, error } = await admin.rpc("create_team_api_key", {
        p_name: p.name, p_scope: p.scope,
        p_expires_at: p.expires_at ?? null, p_created_by: ctx.created_by,
      });
      if (error) throw new Error(error.message);
      const row = (data as any[])[0];
      return {
        key: { id: row.key_id, name: p.name, scope: p.scope, key_hint: row.hint },
        plaintext: row.plaintext,
        warning: "Save this plaintext now — it is shown only once.",
      };
    },
  },
  "keys.revoke": {
    scope: "admin",
    fn: async (admin, p) => {
      if (!p?.id) throw new Error("id required");
      const { data, error } = await admin.from("team_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", p.id).select().single();
      if (error) throw new Error(error.message);
      return { key: data };
    },
  },
  "keys.usage": {
    scope: "admin",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 100, 1000);
      let q = admin.from("api_call_log")
        .select("id, api_key_id, action, status_code, duration_ms, ip, error_message, created_at")
        .order("created_at", { ascending: false }).limit(limit);
      if (p?.api_key_id) q = q.eq("api_key_id", p.api_key_id);
      if (p?.action) q = q.eq("action", p.action);
      if (p?.status_code) q = q.eq("status_code", p.status_code);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { calls: data };
    },
  },

  /* ───────── analytics / funnel ───────── */
  "analytics.funnel": {
    scope: "read",
    fn: async (admin, p) => {
      const days = Math.min(p?.days ?? 30, 365);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const [u, o, e] = await Promise.all([
        admin.from("users").select("id", { count: "exact", head: true }).gte("created_at", since),
        admin.from("payment_orders").select("status", { count: "exact" }).gte("created_at", since),
        admin.from("enrolments").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      const orders = (o.data || []) as Array<{ status: string }>;
      return {
        days,
        signups: u.count ?? 0,
        orders_created: orders.length,
        orders_captured: orders.filter((x) => x.status === "paid").length,
        orders_failed: orders.filter((x) => x.status === "failed").length,
        enrolments: e.count ?? 0,
      };
    },
  },
  "analytics.utm_breakdown": {
    scope: "read",
    fn: async (admin, p) => {
      const days = Math.min(p?.days ?? 30, 365);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data } = await admin.from("crm_contacts")
        .select("utm_source, utm_campaign, status")
        .gte("created_at", since);
      const breakdown = new Map<string, { utm_source: string; utm_campaign: string; leads: number; converted: number }>();
      for (const r of (data || []) as any[]) {
        const k = `${r.utm_source ?? "(none)"}|${r.utm_campaign ?? "(none)"}`;
        const e = breakdown.get(k) ?? { utm_source: r.utm_source ?? "(none)", utm_campaign: r.utm_campaign ?? "(none)", leads: 0, converted: 0 };
        e.leads++;
        if (r.status === "converted") e.converted++;
        breakdown.set(k, e);
      }
      return { days, rows: Array.from(breakdown.values()).sort((a, b) => b.leads - a.leads) };
    },
  },
  "analytics.cohort_engagement": {
    scope: "read",
    fn: async (admin, p) => {
      if (!p?.batch_id) throw new Error("batch_id required");
      const [{ data: members }, { data: submissions }, { data: attendance }] = await Promise.all([
        admin.from("cohort_batch_members").select("id, enrolment_id").eq("batch_id", p.batch_id),
        admin.from("cohort_submissions").select("user_id, week_id, status").eq("batch_id", p.batch_id),
        admin.from("cohort_attendance").select("user_id, session_id, status").eq("batch_id", p.batch_id),
      ]);
      return {
        batch_id: p.batch_id,
        member_count: members?.length ?? 0,
        submissions_total: submissions?.length ?? 0,
        attendance_total: attendance?.length ?? 0,
        attendance_present: (attendance || []).filter((a: any) => a.status === "present").length,
      };
    },
  },

  /* ───────── enrolments export ───────── */
  "enrolments.export": {
    scope: "read",
    fn: async (admin, p) => {
      const limit = Math.min(p?.limit ?? 500, 5000);
      let q = admin.from("enrolments")
        .select("id, user_id, offering_id, status, total_paid_inr, created_at, users:user_id(email, phone, full_name), offerings:offering_id(slug, title, type)")
        .order("created_at", { ascending: false }).limit(limit);
      if (p?.cursor) q = q.lt("created_at", p.cursor);
      if (p?.status) q = q.eq("status", p.status);
      if (p?.offering_id) q = q.eq("offering_id", p.offering_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const flat = (data || []).map((e: any) => ({
        id: e.id, user_id: e.user_id, offering_id: e.offering_id,
        email: e.users?.email, phone: e.users?.phone, full_name: e.users?.full_name,
        offering_slug: e.offerings?.slug, offering_title: e.offerings?.title, offering_type: e.offerings?.type,
        status: e.status, total_paid_inr: e.total_paid_inr, created_at: e.created_at,
      }));
      const nextCursor = flat.length === limit ? flat[flat.length - 1].created_at : null;
      return { enrolments: flat, count: flat.length, next_cursor: nextCursor };
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
