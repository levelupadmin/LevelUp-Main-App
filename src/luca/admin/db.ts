import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The LUCA tables ship in this branch's migrations and are not in the
 * generated Database types, so the console talks to them through an untyped
 * client. RLS does the gatekeeping: config tables are admin-write
 * (luca_programs, _mentors, _weeks, _sessions, _assignments, _clans,
 * _announcements, _resources, _hotseat, _demo_slots); learner activity is
 * RPC-only even for admins.
 */
export const db = supabase as unknown as SupabaseClient;

export type Row = Record<string, unknown> & { id: string };

export interface ProgramRow extends Row {
  slug: string; offering_id: string | null; is_demo: boolean; enabled: boolean;
  name: string; short_name: string; cohort_label: string;
  starts_at: string | null; demo_day_at: string | null; ends_at: string | null;
  seats: number | null; hours_per_week: number | null; hero_url: string | null; timezone: string;
  whatsapp_url: string | null; drive_url: string | null; support_whatsapp: string | null;
  features: Record<string, boolean>;
  coin_rules: Record<string, { label: string; value: number }>;
  content: Record<string, unknown>;
  pricing: Record<string, unknown>;
  sprint: { starts_on: string | null; days: number; track_b_posts_per_week?: number };
  clan_config: { names: string[]; size: number; reveal_at: string | null };
  updated_at: string;
}

/* ---- program-timezone <-> <input type="datetime-local"> ---- */

/** Offset (ms) of `tz` from UTC at instant `t`. */
function offsetAt(t: number, tz: string): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** ISO instant → "YYYY-MM-DDTHH:mm" wall time in the program's zone. */
export function toZoned(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + offsetAt(t, tz)).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" wall time in the program's zone → ISO instant. */
export function fromZoned(local: string, tz: string): string | null {
  if (!local) return null;
  const guess = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(guess)) return null;
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz); // second pass settles DST edges
  return new Date(t).toISOString();
}

/* ---- field specs for the row editors ---- */
export type FieldType =
  | "text" | "textarea" | "number" | "bool" | "date" | "datetime" | "json" | "lines"
  | "select" | "mentors" | "session" | "user";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: [string, string][];
  required?: boolean;
  wide?: boolean;
}

/** Turn a DB value into the editor's string form. */
export function toForm(f: Field, v: unknown, tz: string): string | boolean {
  switch (f.type) {
    case "bool": return !!v;
    case "datetime": return toZoned(v as string | null, tz);
    case "date": return (v as string | null)?.slice(0, 10) ?? "";
    case "json": return v == null ? "" : JSON.stringify(v, null, 2);
    case "lines": return Array.isArray(v) ? (v as string[]).join("\n") : "";
    case "mentors": return Array.isArray(v) ? (v as string[]).join(",") : "";
    case "number": return v == null ? "" : String(v);
    default: return v == null ? "" : String(v);
  }
}

/** And back. Throws a readable Error on invalid input. */
export function fromForm(f: Field, v: string | boolean, tz: string): unknown {
  if (f.type === "bool") return !!v;
  const s = String(v ?? "");
  if (f.required && !s.trim()) throw new Error(`${f.label} is required`);
  switch (f.type) {
    case "number": {
      if (!s.trim()) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number`);
      return n;
    }
    case "datetime": return s ? fromZoned(s, tz) : null;
    case "date": return s || null;
    case "json": {
      if (!s.trim()) return null;
      try { return JSON.parse(s); } catch { throw new Error(`${f.label} isn't valid JSON`); }
    }
    case "lines": return s.split("\n").map((x) => x.trim()).filter(Boolean);
    case "mentors": return s ? s.split(",").filter(Boolean) : [];
    case "session": case "user": case "select": return s || null;
    default: return s.trim() === "" && !f.required ? null : s;
  }
}

/** Look up a LevelUp account by email (admins can read users). Throws if the lookup itself fails. */
export async function userIdByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from("users").select("id, full_name, email").ilike("email", email.trim()).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id as string, name: (data.full_name as string) || (data.email as string) } : null;
}
