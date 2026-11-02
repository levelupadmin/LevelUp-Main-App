import { supabase } from "@/integrations/supabase/client";
import type { DesignField } from "@/lib/certificates";

// The certificate tables and RPCs are newer than the generated types, so the
// admin screens read them through this untyped handle (same pattern as the
// other admin pages that touch new tables).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export interface OverviewRow {
  course_id: string;
  course_title: string;
  product_tier: "masterclass" | "live_cohort" | "workshop";
  offering_id: string;
  offering_title: string;
  template_id: string | null;
  design_id: string | null;
  design_name: string | null;
  issue_mode: "auto" | "manual";
  threshold: number;
  line_text: string | null;
  total_lessons: number;
  students: number;
  eligible: number;
  issued: number;
  emailed: number;
  not_claimed: number;
}

export interface Totals {
  issued: number;
  emailed: number;
  no_email: number;
  failed: number;
  waiting: number;
  revoked: number;
}

export interface PersonRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  offering_title: string;
  done: number;
  total: number;
  needed: number;
  certificate_id: string | null;
  certificate_number: string | null;
  name_on_certificate: string | null;
  cert_status: "valid" | "revoked" | null;
  email_status: string | null;
  email_to: string | null;
  last_emailed_at: string | null;
  issued_at: string | null;
}

export interface StudentCourseRow {
  course_id: string;
  course_title: string;
  product_tier: string;
  template_ready: boolean;
  issue_mode: "auto" | "manual" | null;
  done: number;
  total: number;
  needed: number;
  certificate_id: string | null;
  certificate_number: string | null;
  name_on_certificate: string | null;
  cert_status: "valid" | "revoked" | null;
  email_status: string | null;
  email_to: string | null;
  last_emailed_at: string | null;
  last_email_error: string | null;
  issued_at: string | null;
  resends_48h: number;
  downloads: number;
}

export interface DesignRow {
  id: string;
  name: string;
  kind: "masterclass" | "cohort" | "workshop" | "other";
  image_path: string;
  image_width: number;
  image_height: number;
  fields: DesignField[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface EventRow {
  id: number;
  kind: string;
  actor_kind: string;
  actor_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchOverview = () => rpc<OverviewRow[]>("admin_certificate_overview");
export const fetchTotals = async () => (await rpc<Totals[]>("admin_certificate_totals"))[0];
export const fetchPeople = (courseId: string) => rpc<PersonRow[]>("admin_certificate_people", { p_course: courseId });
export const fetchStudent = (userId: string) => rpc<StudentCourseRow[]>("admin_certificate_student", { p_user: userId });

export async function fetchDesigns(): Promise<DesignRow[]> {
  const { data, error } = await db
    .from("certificate_designs")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as DesignRow[];
}

export async function fetchEvents(certificateId: string): Promise<EventRow[]> {
  const { data, error } = await db
    .from("certificate_events")
    .select("id, kind, actor_kind, actor_id, detail, created_at")
    .eq("certificate_id", certificateId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data as EventRow[];
}

export const EMAIL_STATUS_LABEL: Record<string, string> = {
  sent: "Emailed",
  failed: "Email failed",
  waiting: "Email waiting",
  no_email: "No email on file",
  skipped: "Not sent (test site)",
  none: "Not emailed",
};

export const EVENT_LABEL: Record<string, string> = {
  issued: "Issued",
  reissued: "Reissued with a new name",
  revoked: "Cancelled",
  restored: "Restored",
  email_sent: "Email sent",
  email_failed: "Email failed",
  email_waiting: "Email waiting",
  email_skipped: "Email not sent (test site)",
  email_no_address: "No email address",
  resend_requested: "Asked to send again",
  downloaded: "Downloaded",
  blocked: "Blocked",
};
