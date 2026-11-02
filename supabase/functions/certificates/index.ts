// certificates — the only place a certificate is made, emailed or handed out.
//
// Callers:
//   * students (their session): status · claim · resend · download
//   * admins/owners (their session): admin_issue · admin_resend · admin_reissue
//     · admin_revoke · admin_restore · admin_download · admin_preview
//   * the cron sweep (service token): sweep — auto-issues anyone on an Auto
//     course who crossed the threshold after it was switched on, and sends
//     emails that were waiting (daily cap / mailbox not set up yet).
//
// verify_jwt is OFF (like get-video-src): the service sweep has no user JWT,
// so every action checks its own caller below.
//
// Limits (server-side, counted from certificate_events):
//   * a student can ask for the email again RESENDS_PER_48H times per 48 hours
//   * a student can open DOWNLOADS_PER_DAY download links per certificate per day
//   * claiming twice never makes a second certificate (unique user+course)
//   * admins have no limit; everything they do is logged with their id
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { isSyntheticEmail } from "../_shared/phone.ts";
import {
  cleanFields,
  FONT_FILES,
  renderCertificatePdf,
  type CertificateValues,
  type DesignField,
  type FontKey,
} from "./render.ts";
import { certificateEmail, sendCertificateEmail, smtpConfigured } from "./mail.ts";

const DESIGN_BUCKET = "certificate-designs";
const FILE_BUCKET = "certificate-files";
const RESENDS_PER_48H = 2;
const DOWNLOADS_PER_DAY = 10;
const LINK_SECONDS = 300;
const ADMIN_BATCH_MAX = 5;
const SWEEP_ISSUE_LIMIT = 5;
const SWEEP_EMAIL_LIMIT = 10;
const MAX_EMAIL_FAILURES = 3;
const DAILY_EMAIL_CAP = Number(Deno.env.get("CERT_EMAIL_DAILY_CAP") ?? "300");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;
type Actor = { kind: "student" | "admin" | "system"; id: string | null };

interface Template {
  id: string;
  course_id: string;
  design_id: string | null;
  issue_mode: "auto" | "manual";
  completion_threshold: number;
  line_text: string | null;
  is_active: boolean;
}
interface Design {
  id: string;
  name: string;
  image_path: string;
  image_width: number;
  image_height: number;
  fields: unknown;
  updated_at: string;
}
interface Cert {
  id: string;
  user_id: string;
  course_id: string;
  template_id: string;
  offering_id: string | null;
  certificate_number: string;
  verify_code: string | null;
  name_on_certificate: string | null;
  pdf_path: string | null;
  status: "valid" | "revoked";
  completed_on: string | null;
  email_to: string | null;
  email_status: string;
  last_emailed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const CERT_COLUMNS =
  "id,user_id,course_id,template_id,offering_id,certificate_number,verify_code,name_on_certificate,pdf_path,status,completed_on,email_to,email_status,last_emailed_at,metadata,created_at";

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

// ── Small helpers ───────────────────────────────────────────────────
const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in").replace(/\/+$/, "");
const verifyUrlFor = (code: string) => `${siteUrl()}/v/${code}`;

function newVerifyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** A name is printable when it looks like a person's name, not a placeholder. */
function usableName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return null;
  if (/@|https?:|\d{4,}/i.test(name)) return null;
  if (/^(student|learner|user|test|na|n\/a|guest)$/i.test(name)) return null;
  if (!/\p{L}/u.test(name)) return null;
  return name;
}

function usableEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return null;
  if (isSyntheticEmail(email)) return null;
  return email;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}

function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function printableDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}

function istMidnight(): string {
  return new Date(`${istDate(new Date())}T00:00:00+05:30`).toISOString();
}

async function logEvent(
  admin: Admin,
  e: { certificate_id?: string | null; user_id: string; course_id: string; kind: string; actor: Actor; detail?: Record<string, unknown> },
) {
  const { error } = await admin.from("certificate_events").insert({
    certificate_id: e.certificate_id ?? null,
    user_id: e.user_id,
    course_id: e.course_id,
    kind: e.kind,
    actor_id: e.actor.id,
    actor_kind: e.actor.kind,
    detail: e.detail ?? {},
  });
  if (error) console.error("certificate_events insert failed", { kind: e.kind, error: error.message });
}

async function countEvents(admin: Admin, filter: { certificate_id?: string; kind: string; actor_kind?: string; since: string }) {
  let q = admin.from("certificate_events").select("id", { count: "exact", head: true }).eq("kind", filter.kind).gte("created_at", filter.since);
  if (filter.certificate_id) q = q.eq("certificate_id", filter.certificate_id);
  if (filter.actor_kind) q = q.eq("actor_kind", filter.actor_kind);
  const { count } = await q;
  return count ?? 0;
}

// ── Loading ─────────────────────────────────────────────────────────
async function loadTemplate(admin: Admin, courseId: string): Promise<{ template: Template; design: Design } | null> {
  const { data: t } = await admin
    .from("certificate_templates")
    .select("id,course_id,design_id,issue_mode,completion_threshold,line_text,is_active")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!t || !t.is_active || !t.design_id) return null;
  const { data: d } = await admin
    .from("certificate_designs")
    .select("id,name,image_path,image_width,image_height,fields,updated_at")
    .eq("id", t.design_id)
    .maybeSingle();
  if (!d) return null;
  return { template: t as Template, design: d as Design };
}

async function loadCert(admin: Admin, by: { id?: string; userId?: string; courseId?: string }): Promise<Cert | null> {
  let q = admin.from("certificates").select(CERT_COLUMNS);
  if (by.id) q = q.eq("id", by.id);
  else q = q.eq("user_id", by.userId!).eq("course_id", by.courseId!);
  const { data } = await q.maybeSingle();
  return (data as Cert | null) ?? null;
}

async function activeOffering(admin: Admin, userId: string, courseId: string): Promise<string | null> {
  const { data: links } = await admin.from("offering_courses").select("offering_id").eq("course_id", courseId);
  const ids = (links ?? []).map((l: { offering_id: string }) => l.offering_id);
  if (ids.length === 0) return null;
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("enrolments")
    .select("offering_id, expires_at, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("offering_id", ids)
    .order("created_at", { ascending: false });
  const live = (data ?? []).find((e: { expires_at: string | null }) => !e.expires_at || e.expires_at > nowIso);
  return live?.offering_id ?? null;
}

async function progressFor(admin: Admin, userId: string, courseId: string, threshold: number) {
  const { data, error } = await admin.rpc("certificate_progress", { p_user: userId, p_course: courseId, p_threshold: threshold });
  if (error) throw new Error(`progress failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) ?? { done: 0, total: 0, needed: 1, crossed_at: null };
  return row as { done: number; total: number; needed: number; crossed_at: string | null };
}

async function profileOf(admin: Admin, userId: string) {
  const { data } = await admin.from("users").select("id, full_name, email, phone, role").eq("id", userId).maybeSingle();
  return data as { id: string; full_name: string | null; email: string | null; phone: string | null; role: string } | null;
}

// Per-instance caches: fonts never change; a design image is keyed by its
// path + updated_at so an edited design is fetched again.
const fontCache = new Map<FontKey, Uint8Array>();
const imageCache = new Map<string, Uint8Array>();

async function publicBytes(path: string): Promise<Uint8Array> {
  const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${DESIGN_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${path} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fontsFor(fields: DesignField[]) {
  const wanted = new Set<FontKey>(["sans"]);
  fields.forEach((f) => f.font && wanted.add(f.font));
  const out: Partial<Record<FontKey, Uint8Array>> = {};
  for (const key of wanted) {
    let bytes = fontCache.get(key);
    if (!bytes) {
      bytes = await publicBytes(FONT_FILES[key]);
      fontCache.set(key, bytes);
    }
    out[key] = bytes;
  }
  return out;
}

async function designImage(design: { image_path: string; updated_at?: string }) {
  const key = `${design.image_path}@${design.updated_at ?? ""}`;
  let bytes = imageCache.get(key);
  if (!bytes) {
    bytes = await publicBytes(design.image_path);
    if (imageCache.size > 8) imageCache.clear();
    imageCache.set(key, bytes);
  }
  return bytes;
}

function designImageUrl(path: string) {
  return `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${DESIGN_BUCKET}/${path}`;
}

// ── Making the PDF ──────────────────────────────────────────────────
async function renderAndStore(admin: Admin, cert: Cert, template: Template, design: Design, courseTitle: string): Promise<Cert> {
  const fields = cleanFields(design.fields);
  const code = cert.verify_code!;
  const values: CertificateValues = {
    name: cert.name_on_certificate ?? "",
    date: printableDate(cert.completed_on ?? istDate(new Date(cert.created_at))),
    number: cert.certificate_number,
    line: template.line_text ?? "",
    verify: verifyUrlFor(code).replace(/^https?:\/\//, ""),
    verifyUrl: verifyUrlFor(code),
  };
  const pdf = await renderCertificatePdf({
    image: await designImage(design),
    imageWidth: design.image_width,
    imageHeight: design.image_height,
    fields,
    values,
    fonts: await fontsFor(fields),
    title: `${courseTitle}: certificate for ${values.name}`,
  });
  const path = `${cert.user_id}/${cert.id}/${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage.from(FILE_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`could not store the PDF: ${upErr.message}`);

  // Freeze what was printed so the app can show the same certificate later,
  // even if the design is edited afterwards.
  const render = {
    image_url: designImageUrl(design.image_path),
    width: design.image_width,
    height: design.image_height,
    fields,
    values: { ...values, verifyUrl: undefined },
  };
  const metadata = { ...(cert.metadata ?? {}), render, design_id: design.id, course_title: courseTitle };
  const { data, error } = await admin
    .from("certificates")
    .update({ pdf_path: path, image_url: render.image_url, metadata, updated_at: new Date().toISOString() })
    .eq("id", cert.id)
    .select(CERT_COLUMNS)
    .single();
  if (error) throw new Error(`could not save the certificate: ${error.message}`);
  return data as Cert;
}

async function courseTitle(admin: Admin, courseId: string) {
  const { data } = await admin.from("courses").select("title").eq("id", courseId).maybeSingle();
  return (data?.title as string | undefined) ?? "your course";
}

/** Create the certificate row (number + check code), then draw its PDF. */
async function issue(
  admin: Admin,
  opts: {
    userId: string;
    courseId: string;
    template: Template;
    design: Design;
    offeringId: string | null;
    name: string;
    email: string | null;
    actor: Actor;
    generatedBy: "auto" | "admin_manual" | "claim";
    evidence: Record<string, unknown>;
    completedOn: string;
  },
): Promise<{ cert: Cert; created: boolean }> {
  const existing = await loadCert(admin, { userId: opts.userId, courseId: opts.courseId });
  if (existing) return { cert: existing, created: false };

  const { data: number, error: numErr } = await admin.rpc("next_certificate_number");
  if (numErr || !number) throw new Error(`could not get a certificate number: ${numErr?.message ?? "empty"}`);

  let inserted: Cert | null = null;
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    const { data, error } = await admin
      .from("certificates")
      .insert({
        user_id: opts.userId,
        course_id: opts.courseId,
        template_id: opts.template.id,
        offering_id: opts.offeringId,
        certificate_number: number as string,
        verify_code: newVerifyCode(),
        name_on_certificate: opts.name,
        generated_by: opts.generatedBy,
        issued_by: opts.actor.kind === "admin" ? opts.actor.id : null,
        completed_on: opts.completedOn,
        email_to: opts.email,
        evidence: opts.evidence,
        metadata: {},
      })
      .select(CERT_COLUMNS)
      .single();
    if (!error) {
      inserted = data as Cert;
      break;
    }
    if (error.code === "23505") {
      // Someone else issued it a moment ago (double tap, sweep), or the check
      // code collided. Prefer the existing certificate.
      const again = await loadCert(admin, { userId: opts.userId, courseId: opts.courseId });
      if (again) return { cert: again, created: false };
      continue;
    }
    throw new Error(`could not create the certificate: ${error.message}`);
  }
  if (!inserted) throw new Error("could not create the certificate");

  await logEvent(admin, {
    certificate_id: inserted.id,
    user_id: opts.userId,
    course_id: opts.courseId,
    kind: "issued",
    actor: opts.actor,
    detail: { generated_by: opts.generatedBy, evidence: opts.evidence, name: opts.name },
  });

  const title = await courseTitle(admin, opts.courseId);
  const cert = await renderAndStore(admin, inserted, opts.template, opts.design, title);
  return { cert, created: true };
}

/** Make sure the PDF exists (a render that failed earlier is retried). */
async function ensurePdf(admin: Admin, cert: Cert): Promise<Cert> {
  if (cert.pdf_path) return cert;
  const { data: t } = await admin
    .from("certificate_templates")
    .select("id,course_id,design_id,issue_mode,completion_threshold,line_text,is_active")
    .eq("id", cert.template_id)
    .maybeSingle();
  if (!t?.design_id) throw new HttpError(409, "no_design", "This course has no certificate design yet.");
  const { data: d } = await admin
    .from("certificate_designs")
    .select("id,name,image_path,image_width,image_height,fields,updated_at")
    .eq("id", t.design_id)
    .single();
  return await renderAndStore(admin, cert, t as Template, d as Design, await courseTitle(admin, cert.course_id));
}

// ── Email ───────────────────────────────────────────────────────────
async function setEmailState(admin: Admin, certId: string, patch: Record<string, unknown>) {
  await admin.from("certificates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", certId);
}

/** Send (or park) the certificate email. Never throws for delivery problems;
 *  the outcome is stored on the certificate and in the event log. */
async function emailCertificate(admin: Admin, certIn: Cert, actor: Actor, toOverride?: string | null) {
  let cert = certIn;
  const base = { certificate_id: cert.id, user_id: cert.user_id, course_id: cert.course_id, actor };
  if (cert.status !== "valid") return { email: "revoked" as const };

  const profile = await profileOf(admin, cert.user_id);
  const to = usableEmail(toOverride) ?? usableEmail(cert.email_to) ?? usableEmail(profile?.email);
  if (!to) {
    await setEmailState(admin, cert.id, { email_status: "no_email" });
    await logEvent(admin, { ...base, kind: "email_no_address" });
    return { email: "no_email" as const };
  }
  if (to !== cert.email_to) await setEmailState(admin, cert.id, { email_to: to });

  const allow = (Deno.env.get("CERT_EMAIL_ALLOWLIST") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(to)) {
    await setEmailState(admin, cert.id, { email_status: "skipped", last_email_error: "Not on this environment's test list" });
    await logEvent(admin, { ...base, kind: "email_skipped", detail: { to, reason: "not on the test allowlist" } });
    return { email: "skipped" as const };
  }
  if (!smtpConfigured()) {
    await setEmailState(admin, cert.id, { email_status: "waiting", last_email_error: "The sending mailbox isn't set up yet" });
    await logEvent(admin, { ...base, kind: "email_waiting", detail: { to, reason: "mailbox not set up" } });
    return { email: "waiting" as const };
  }
  const sentToday = await countEvents(admin, { kind: "email_sent", since: istMidnight() });
  if (sentToday >= DAILY_EMAIL_CAP) {
    await setEmailState(admin, cert.id, { email_status: "waiting", last_email_error: "Daily email limit reached; it goes out tomorrow" });
    await logEvent(admin, { ...base, kind: "email_waiting", detail: { to, reason: "daily cap", cap: DAILY_EMAIL_CAP } });
    return { email: "waiting" as const };
  }

  try {
    cert = await ensurePdf(admin, cert);
    const { data: file, error } = await admin.storage.from(FILE_BUCKET).download(cert.pdf_path!);
    if (error || !file) throw new Error(`could not read the PDF: ${error?.message ?? "empty"}`);
    const title = await courseTitle(admin, cert.course_id);
    const mail = certificateEmail({ name: cert.name_on_certificate ?? "", course: title, verifyUrl: verifyUrlFor(cert.verify_code!) });
    await sendCertificateEmail({
      to,
      ...mail,
      pdf: new Uint8Array(await file.arrayBuffer()),
      filename: `LevelUp-Certificate-${cert.certificate_number}.pdf`,
    });
    await setEmailState(admin, cert.id, { email_status: "sent", last_emailed_at: new Date().toISOString(), last_email_error: null });
    await logEvent(admin, { ...base, kind: "email_sent", detail: { to } });
    return { email: "sent" as const };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("certificate email failed", { certificate_id: cert.id, message });
    await setEmailState(admin, cert.id, { email_status: "failed", last_email_error: message });
    await logEvent(admin, { ...base, kind: "email_failed", detail: { to, error: message } });
    return { email: "failed" as const };
  }
}

// ── What a student sees for one course ─────────────────────────────
async function studentView(admin: Admin, userId: string, courseId: string) {
  const setup = await loadTemplate(admin, courseId);
  const profile = await profileOf(admin, userId);
  const threshold = setup?.template.completion_threshold ?? 85;
  const prog = await progressFor(admin, userId, courseId, threshold);
  const cert = await loadCert(admin, { userId, courseId });
  const email = usableEmail(cert?.email_to) ?? usableEmail(profile?.email);

  let certificate: Record<string, unknown> | null = null;
  if (cert) {
    const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: recent } = await admin
      .from("certificate_events")
      .select("created_at")
      .eq("certificate_id", cert.id)
      .eq("kind", "resend_requested")
      .eq("actor_kind", "student")
      .gte("created_at", since48)
      .order("created_at", { ascending: true });
    const used = (recent ?? []).length;
    certificate = {
      id: cert.id,
      number: cert.certificate_number,
      name: cert.name_on_certificate,
      status: cert.status,
      completed_on: cert.completed_on,
      verify_code: cert.verify_code,
      verify_url: cert.verify_code ? verifyUrlFor(cert.verify_code) : null,
      email_status: cert.email_status,
      email_to: maskEmail(cert.email_to),
      last_emailed_at: cert.last_emailed_at,
      resends_left: Math.max(0, RESENDS_PER_48H - used),
      next_resend_at:
        used >= RESENDS_PER_48H && recent?.[0]
          ? new Date(new Date(recent[0].created_at).getTime() + 48 * 3600 * 1000).toISOString()
          : null,
      render: (cert.metadata as { render?: unknown } | null)?.render ?? null,
    };
  }

  return {
    ready: !!setup,
    mode: setup?.template.issue_mode ?? null,
    threshold,
    done: prog.done,
    total: prog.total,
    needed: prog.needed,
    eligible: prog.total > 0 && prog.done >= prog.needed,
    certificate,
    profile_name: profile?.full_name ?? null,
    name_ok: !!usableName(profile?.full_name),
    has_email: !!email,
    email: maskEmail(email),
  };
}

// ── Actions ─────────────────────────────────────────────────────────
async function claim(admin: Admin, userId: string, body: Record<string, unknown>) {
  const courseId = String(body.course_id ?? "");
  if (!UUID_RE.test(courseId)) throw new HttpError(400, "bad_request", "course_id is required");
  const auto = body.auto === true;

  const existing = await loadCert(admin, { userId, courseId });
  if (existing) return { result: "already", view: await studentView(admin, userId, courseId) };

  const setup = await loadTemplate(admin, courseId);
  if (!setup) throw new HttpError(409, "not_ready", "Certificates for this course aren't ready yet.");
  // Live cohorts are issued by the team (admin_issue), never self-claimed.
  if (setup.template.issue_mode !== "auto") {
    throw new HttpError(409, "manual", "The LevelUp team sends this certificate once the program ends.");
  }
  const offeringId = await activeOffering(admin, userId, courseId);
  if (!offeringId) throw new HttpError(403, "no_access", "You don't have access to this course.");

  const prog = await progressFor(admin, userId, courseId, setup.template.completion_threshold);
  if (!(prog.total > 0 && prog.done >= prog.needed)) {
    throw new HttpError(409, "not_eligible", `Finish ${prog.needed} of ${prog.total} lessons to get your certificate.`, prog);
  }

  const profile = await profileOf(admin, userId);
  const typedName = body.name == null ? null : usableName(String(body.name));
  if (body.name != null && !typedName) throw new HttpError(400, "bad_name", "Enter your full name as it should appear.");
  const name = typedName ?? usableName(profile?.full_name);
  if (!name) {
    if (auto) return { result: "need_name", view: await studentView(admin, userId, courseId) };
    throw new HttpError(409, "need_name", "Tell us the name to print on your certificate.");
  }

  const typedEmail = body.email == null || body.email === "" ? null : usableEmail(String(body.email));
  if (body.email && !typedEmail) throw new HttpError(400, "bad_email", "That email doesn't look right.");
  const email = typedEmail ?? usableEmail(profile?.email);

  const actor: Actor = { kind: auto ? "system" : "student", id: auto ? null : userId };
  const { cert, created } = await issue(admin, {
    userId,
    courseId,
    template: setup.template,
    design: setup.design,
    offeringId,
    name,
    email,
    actor,
    generatedBy: auto ? "auto" : "claim",
    evidence: { done: prog.done, total: prog.total, needed: prog.needed, threshold: setup.template.completion_threshold, crossed_at: prog.crossed_at },
    completedOn: istDate(prog.crossed_at ? new Date(prog.crossed_at) : new Date()),
  });
  const mail = created ? await emailCertificate(admin, cert, actor, email) : { email: "unchanged" };
  return { result: created ? "issued" : "already", email: mail.email, view: await studentView(admin, userId, courseId) };
}

async function studentResend(admin: Admin, userId: string, body: Record<string, unknown>) {
  const courseId = String(body.course_id ?? "");
  if (!UUID_RE.test(courseId)) throw new HttpError(400, "bad_request", "course_id is required");
  const cert = await loadCert(admin, { userId, courseId });
  if (!cert) throw new HttpError(404, "no_certificate", "You don't have a certificate for this course yet.");
  if (cert.status !== "valid") throw new HttpError(409, "revoked", "This certificate was cancelled.");

  const typedEmail = body.email == null || body.email === "" ? null : usableEmail(String(body.email));
  if (body.email && !typedEmail) throw new HttpError(400, "bad_email", "That email doesn't look right.");

  const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const used = await countEvents(admin, { certificate_id: cert.id, kind: "resend_requested", actor_kind: "student", since: since48 });
  if (used >= RESENDS_PER_48H) {
    const view = await studentView(admin, userId, courseId);
    await logEvent(admin, { certificate_id: cert.id, user_id: userId, course_id: courseId, kind: "blocked", actor: { kind: "student", id: userId }, detail: { reason: "resend limit" } });
    throw new HttpError(429, "resend_limit", "You've asked for this email twice in the last 48 hours. You can still download it here.", { view });
  }
  await logEvent(admin, { certificate_id: cert.id, user_id: userId, course_id: courseId, kind: "resend_requested", actor: { kind: "student", id: userId } });
  const mail = await emailCertificate(admin, cert, { kind: "student", id: userId }, typedEmail);
  return { result: "resent", email: mail.email, view: await studentView(admin, userId, courseId) };
}

async function downloadLink(admin: Admin, cert: Cert, actor: Actor) {
  if (actor.kind === "student") {
    if (cert.status !== "valid") throw new HttpError(409, "revoked", "This certificate was cancelled.");
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const used = await countEvents(admin, { certificate_id: cert.id, kind: "downloaded", actor_kind: "student", since });
    if (used >= DOWNLOADS_PER_DAY) throw new HttpError(429, "download_limit", "You've downloaded this many times today. Try again tomorrow.");
  }
  const ready = await ensurePdf(admin, cert);
  const filename = `LevelUp-Certificate-${ready.certificate_number}.pdf`;
  const { data, error } = await admin.storage.from(FILE_BUCKET).createSignedUrl(ready.pdf_path!, LINK_SECONDS, { download: filename });
  if (error || !data?.signedUrl) throw new Error(`could not make a download link: ${error?.message ?? "empty"}`);
  await logEvent(admin, { certificate_id: cert.id, user_id: cert.user_id, course_id: cert.course_id, kind: "downloaded", actor });
  return { url: data.signedUrl, filename, expires_in: LINK_SECONDS };
}

async function adminIssue(admin: Admin, actorId: string, body: Record<string, unknown>) {
  const courseId = String(body.course_id ?? "");
  if (!UUID_RE.test(courseId)) throw new HttpError(400, "bad_request", "course_id is required");
  const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String).filter((id) => UUID_RE.test(id)) : [];
  if (userIds.length === 0) throw new HttpError(400, "bad_request", "Pick at least one student.");
  if (userIds.length > ADMIN_BATCH_MAX) throw new HttpError(400, "bad_request", `Send at most ${ADMIN_BATCH_MAX} at a time.`);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const sendEmail = body.send_email !== false;
  const names = (body.names && typeof body.names === "object" ? body.names : {}) as Record<string, string>;
  const emailOverride = typeof body.email === "string" ? body.email : null;

  const setup = await loadTemplate(admin, courseId);
  if (!setup) throw new HttpError(409, "not_ready", "Set up a certificate design for this course first.");
  const actor: Actor = { kind: "admin", id: actorId };
  const results: Record<string, unknown>[] = [];

  for (const userId of userIds) {
    try {
      const offeringId = await activeOffering(admin, userId, courseId);
      if (!offeringId) {
        results.push({ user_id: userId, result: "no_access" });
        continue;
      }
      const prog = await progressFor(admin, userId, courseId, setup.template.completion_threshold);
      const eligible = prog.total > 0 && prog.done >= prog.needed;
      // Auto courses (masterclasses) have a pass mark; going under it needs a
      // reason on record. Manual courses (live cohorts) are the team's call.
      if (!eligible && setup.template.issue_mode === "auto" && !reason) {
        results.push({ user_id: userId, result: "below_threshold", done: prog.done, needed: prog.needed });
        continue;
      }
      const existing = await loadCert(admin, { userId, courseId });
      if (existing) {
        results.push({ user_id: userId, result: "already", certificate_id: existing.id, number: existing.certificate_number });
        continue;
      }
      const profile = await profileOf(admin, userId);
      const name = usableName(names[userId]) ?? usableName(profile?.full_name);
      if (!name) {
        results.push({ user_id: userId, result: "need_name" });
        continue;
      }
      const { cert } = await issue(admin, {
        userId,
        courseId,
        template: setup.template,
        design: setup.design,
        offeringId,
        name,
        email: usableEmail(emailOverride) ?? usableEmail(profile?.email),
        actor,
        generatedBy: "admin_manual",
        evidence: { done: prog.done, total: prog.total, needed: prog.needed, threshold: setup.template.completion_threshold, below_threshold: !eligible, reason: reason || null },
        completedOn: istDate(new Date()),
      });
      const mail = sendEmail ? await emailCertificate(admin, cert, actor, emailOverride) : { email: "not_sent" };
      results.push({ user_id: userId, result: "issued", certificate_id: cert.id, number: cert.certificate_number, email: mail.email });
    } catch (err) {
      console.error("admin_issue failed", { userId, err: err instanceof Error ? err.message : String(err) });
      results.push({ user_id: userId, result: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results };
}

async function adminCertAction(admin: Admin, actorId: string, action: string, body: Record<string, unknown>) {
  const certId = String(body.certificate_id ?? "");
  if (!UUID_RE.test(certId)) throw new HttpError(400, "bad_request", "certificate_id is required");
  const cert = await loadCert(admin, { id: certId });
  if (!cert) throw new HttpError(404, "not_found", "Certificate not found");
  const actor: Actor = { kind: "admin", id: actorId };
  const base = { certificate_id: cert.id, user_id: cert.user_id, course_id: cert.course_id, actor };

  if (action === "admin_resend") {
    await logEvent(admin, { ...base, kind: "resend_requested" });
    const emailOverride = typeof body.email === "string" && body.email.trim() ? body.email : null;
    if (emailOverride && !usableEmail(emailOverride)) throw new HttpError(400, "bad_email", "That email doesn't look right.");
    return { result: "resent", ...(await emailCertificate(admin, cert, actor, emailOverride)) };
  }
  if (action === "admin_download") return await downloadLink(admin, cert, actor);
  if (action === "admin_reissue") {
    const name = usableName(String(body.name ?? ""));
    if (!name) throw new HttpError(400, "bad_name", "Enter the full name as it should appear.");
    const { data, error } = await admin
      .from("certificates")
      .update({ name_on_certificate: name, pdf_path: null, updated_at: new Date().toISOString() })
      .eq("id", cert.id)
      .select(CERT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const fresh = await ensurePdf(admin, data as Cert);
    await logEvent(admin, { ...base, kind: "reissued", detail: { old_name: cert.name_on_certificate, new_name: name } });
    const mail = body.send_email === false ? { email: "not_sent" } : await emailCertificate(admin, fresh, actor);
    return { result: "reissued", ...mail };
  }
  if (action === "admin_revoke") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!reason) throw new HttpError(400, "bad_request", "Say why it's being cancelled.");
    await admin.from("certificates").update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: reason, updated_at: new Date().toISOString() }).eq("id", cert.id);
    await logEvent(admin, { ...base, kind: "revoked", detail: { reason } });
    return { result: "revoked" };
  }
  if (action === "admin_restore") {
    await admin.from("certificates").update({ status: "valid", revoked_at: null, revoked_reason: null, updated_at: new Date().toISOString() }).eq("id", cert.id);
    await logEvent(admin, { ...base, kind: "restored" });
    return { result: "restored" };
  }
  throw new HttpError(400, "bad_request", "Unknown action");
}

async function adminPreview(body: Record<string, unknown>) {
  const design = (body.design ?? {}) as Record<string, unknown>;
  const path = String(design.image_path ?? "");
  const width = Number(design.image_width);
  const height = Number(design.image_height);
  if (!path || !(width > 0) || !(height > 0)) throw new HttpError(400, "bad_request", "Upload a design first.");
  const fields = cleanFields(design.fields);
  const code = "SAMPLE23";
  const pdf = await renderCertificatePdf({
    image: await publicBytes(path),
    imageWidth: width,
    imageHeight: height,
    fields,
    values: {
      name: usableName(String(body.sample_name ?? "")) ?? "Priya Raman",
      date: printableDate(istDate(new Date())),
      number: "LU-CERT-000000",
      line: typeof body.line_text === "string" ? body.line_text : "",
      verify: verifyUrlFor(code).replace(/^https?:\/\//, ""),
      verifyUrl: verifyUrlFor(code),
    },
    fonts: await fontsFor(fields),
    title: "Certificate preview",
  });
  return pdf;
}

async function sweep(admin: Admin) {
  const out = { issued: 0, need_name: 0, emailed: 0, errors: 0 };
  const system: Actor = { kind: "system", id: null };

  const { data: candidates, error } = await admin.rpc("certificate_auto_candidates", { p_limit: SWEEP_ISSUE_LIMIT });
  if (error) console.error("auto candidates failed", error.message);
  for (const c of (candidates ?? []) as { user_id: string; course_id: string }[]) {
    try {
      const r = await claim(admin, c.user_id, { course_id: c.course_id, auto: true });
      if (r.result === "issued") out.issued++;
      if (r.result === "need_name") {
        out.need_name++;
        await logEvent(admin, { user_id: c.user_id, course_id: c.course_id, kind: "blocked", actor: system, detail: { reason: "no usable name; waiting for the student to claim" } });
      }
    } catch (err) {
      out.errors++;
      console.error("sweep issue failed", { ...c, err: err instanceof Error ? err.message : String(err) });
      await logEvent(admin, { user_id: c.user_id, course_id: c.course_id, kind: "blocked", actor: system, detail: { reason: "error", error: String(err).slice(0, 300) } });
    }
  }

  // Emails that were parked (cap reached / mailbox not set up) or failed.
  if (smtpConfigured()) {
    const { data: pending } = await admin
      .from("certificates")
      .select(CERT_COLUMNS)
      .eq("status", "valid")
      .in("email_status", ["waiting", "failed"])
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order("updated_at", { ascending: true })
      .limit(SWEEP_EMAIL_LIMIT);
    for (const cert of (pending ?? []) as Cert[]) {
      if (cert.email_status === "failed") {
        const failures = await countEvents(admin, { certificate_id: cert.id, kind: "email_failed", since: "1970-01-01T00:00:00Z" });
        if (failures >= MAX_EMAIL_FAILURES) continue;
      }
      const r = await emailCertificate(admin, cert, system);
      if (r.email === "sent") out.emailed++;
      if (r.email === "waiting") break;
    }
  }
  return out;
}

// ── Entry ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = { ...corsHeadersFor(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    if (action === "sweep") {
      const worker = Deno.env.get("CERT_WORKER_TOKEN") ?? "";
      const ok = !!token && ((worker && timingSafeEqual(token, worker)) || timingSafeEqual(token, serviceKey));
      if (!ok) return json({ error: "Forbidden" }, 403);
      return json(await sweep(admin));
    }

    if (!token) return json({ error: "Sign in first." }, 401);
    const authed = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Sign in first." }, 401);

    if (action.startsWith("admin_")) {
      const { data: me } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
      if (me?.role !== "owner" && me?.role !== "admin") return json({ error: "Admins only." }, 403);
      if (action === "admin_issue") return json(await adminIssue(admin, user.id, body));
      if (action === "admin_preview") {
        const pdf = await adminPreview(body);
        return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: { ...cors, "Content-Type": "application/pdf" } });
      }
      return json(await adminCertAction(admin, user.id, action, body));
    }

    if (action === "status") {
      const courseId = String(body.course_id ?? "");
      if (!UUID_RE.test(courseId)) return json({ error: "course_id is required" }, 400);
      return json(await studentView(admin, user.id, courseId));
    }
    if (action === "claim") return json(await claim(admin, user.id, body));
    if (action === "resend") return json(await studentResend(admin, user.id, body));
    if (action === "download") {
      const certId = String(body.certificate_id ?? "");
      if (!UUID_RE.test(certId)) return json({ error: "certificate_id is required" }, 400);
      const cert = await loadCert(admin, { id: certId });
      if (!cert || cert.user_id !== user.id) return json({ error: "Certificate not found" }, 404);
      return json(await downloadLink(admin, cert, { kind: "student", id: user.id }));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code, ...err.extra }, err.status);
    console.error("certificates error", err);
    return json({ error: "Something went wrong. Try again in a minute." }, 500);
  }
});
