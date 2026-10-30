// Shared types for AdminEnrolments and its extracted sub-components.

export interface EnrolmentRow {
  id: string;
  status: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string;
  offering_id: string;
  offering_title: string;
  payment_order_id: string | null;
  /** "live" = native payment_orders / admin grant; "legacy" = pre-claim row in legacy_enrolments */
  enrolment_kind?: "live" | "legacy";
  total_paid_inr?: number | null;
  legacy_purchased_at?: string | null;
}

/* ── CSV Import types ── */
export interface CsvRow {
  full_name: string;
  email: string;
  phone: string;
  offering_id: string;
}
