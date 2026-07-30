import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ShieldCheck, Clock, AlertTriangle, Ban } from "lucide-react";

interface Props {
  offeringId: string;
}

/** How many unclaimed legacy rows we pull for the listing. Some offerings have
 *  tens of thousands; the COUNTS below are always exact (head-only queries), and
 *  the table says so when it is showing a subset. */
const LIST_CAP = 500;

type Bucket = "has_access" | "not_live" | "queued" | "wont_claim";

interface AccessRow {
  key: string;
  bucket: Bucket;
  name: string | null;
  email: string | null;
  phone: string | null;
  detail: string;
}

/** The exact shape legacy_enrolments.phone must have for the claim to fire.
 *  public.claim_purchases_for_user canonicalises the caller's CONFIRMED auth
 *  phone to '+91XXXXXXXXXX' and compares it with `le.phone = v_phone_norm`, so
 *  a stored number in any other shape can never be matched — and a phone is
 *  only ever confirmed by the MSG91 OTP flow, which the app runs for +91
 *  numbers only. Everyone else signs in by email magic link, which never sets
 *  phone_confirmed_at, so the claim returns eligible:false and the student
 *  lands on an empty library with nothing visibly failing.
 *  '_' is a single-character wildcard in SQL LIKE, so this pattern matches
 *  '+91' followed by exactly ten characters — i.e. a 13-char string. */
const CLAIMABLE_PHONE_LIKE = "+91__________";

function willAutoClaim(phone: string | null): boolean {
  return !!phone && /^\+91.{10}$/.test(phone);
}

const BUCKET_META: Record<
  Bucket,
  { label: string; icon: typeof ShieldCheck; tone: string; blurb: string }
> = {
  has_access: {
    label: "Has access",
    icon: ShieldCheck,
    tone: "text-emerald-500",
    blurb: "Live enrolment — can open this right now.",
  },
  queued: {
    label: "Queued, unclaimed",
    icon: Clock,
    tone: "text-amber-500",
    blurb: "Bought it, but hasn't signed in yet. Access attaches automatically on their first phone login.",
  },
  wont_claim: {
    label: "Won't auto-claim",
    icon: AlertTriangle,
    tone: "text-red-500",
    blurb:
      "Queued, but the number isn't Indian, so OTP never confirms a phone and the claim can't match. These students will sign in fine and see an EMPTY library. Grant them an enrolment directly.",
  },
  not_live: {
    label: "Revoked or expired",
    icon: Ban,
    tone: "text-muted-foreground",
    blurb: "Held an enrolment that is no longer active.",
  },
};

/** "Access" tab for the offering editor. Reconciles entitlement against actual
 *  access, so a student who is owed this offering but cannot reach it shows up
 *  here instead of only surfacing when they complain. */
export default function AccessTab({ offeringId }: Props) {
  const [rows, setRows] = useState<AccessRow[]>([]);
  // Exact counts from head-only queries. The table below may be a sample; these
  // never are.
  const [queuedTotal, setQueuedTotal] = useState(0);
  const [wontClaimTotal, setWontClaimTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Bucket | "all">("all");

  useEffect(() => {
    if (!offeringId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const legacyBase = () =>
        supabase
          .from("legacy_enrolments")
          .select("id, full_name, email, phone, legacy_program_name", {
            count: "exact",
          })
          .eq("offering_id", offeringId)
          .is("claimed_by_user_id", null);

      const [enrolRes, queuedCountRes, wontClaimRes, legacyRes] = await Promise.all([
        supabase
          .from("enrolments_unified")
          .select("id, status, source, user_email, user_phone, user_full_name, created_at")
          .eq("offering_id", offeringId)
          // enrolments_unified UNIONs real enrolments with legacy_enrolments,
          // marking unclaimed legacy rows 'pending'. Taking the whole view
          // would double-count every legacy purchase (they are counted below
          // from legacy_enrolments directly) AND mislabel 'pending' as
          // revoked. 'live' is the real-enrolment half.
          .eq("enrolment_kind", "live"),
        // Exact total of everyone still waiting to claim.
        supabase
          .from("legacy_enrolments")
          .select("id", { count: "exact", head: true })
          .eq("offering_id", offeringId)
          .is("claimed_by_user_id", null),
        // The dangerous bucket, fetched IN FULL rather than sampled: a phone
        // that can never be matched. There are only a few hundred of these
        // across the whole table, so listing every one is cheap — and a
        // sampled count here would under-report the exact problem this tab
        // exists to surface.
        legacyBase().not("phone", "like", CLAIMABLE_PHONE_LIKE),
        // The benign bucket is large, so only the most recent are listed. The
        // banner below says so.
        legacyBase()
          .like("phone", CLAIMABLE_PHONE_LIKE)
          .order("legacy_purchased_at", { ascending: false })
          .limit(LIST_CAP),
      ]);

      const out: AccessRow[] = [];

      interface EnrolRaw {
        id: string;
        status: string;
        user_email: string | null;
        user_phone: string | null;
        user_full_name: string | null;
        created_at: string | null;
      }
      interface LegacyRaw {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        legacy_program_name: string | null;
      }

      for (const e of ((enrolRes.data || []) as unknown) as EnrolRaw[]) {
        const live = e.status === "active";
        out.push({
          key: `e-${e.id}`,
          bucket: live ? "has_access" : "not_live",
          name: e.user_full_name,
          email: e.user_email,
          phone: e.user_phone,
          detail: live
            ? `enrolled ${String(e.created_at || "").slice(0, 10)}`
            : e.status,
        });
      }

      const legacyRows = [
        ...(((wontClaimRes.data || []) as unknown) as LegacyRaw[]),
        ...(((legacyRes.data || []) as unknown) as LegacyRaw[]),
      ];
      for (const l of legacyRows) {
        out.push({
          key: `l-${l.id}`,
          bucket: willAutoClaim(l.phone) ? "queued" : "wont_claim",
          name: l.full_name,
          email: l.email,
          phone: l.phone,
          detail: l.legacy_program_name || "legacy purchase",
        });
      }

      if (!cancelled) {
        setRows(out);
        setWontClaimTotal(wontClaimRes.count || 0);
        setQueuedTotal(
          Math.max(0, (queuedCountRes.count || 0) - (wontClaimRes.count || 0))
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      has_access: 0,
      queued: 0,
      wont_claim: 0,
      not_live: 0,
    };
    for (const r of rows) c[r.bucket] += 1;
    return c;
  }, [rows]);

  /** Exact totals. `counts` reflects only what was fetched for the table; the
   *  two legacy buckets come from head-only count queries instead, so a large
   *  offering can never under-report. */
  const exact: Record<Bucket, number> = {
    has_access: counts.has_access,
    not_live: counts.not_live,
    queued: queuedTotal,
    wont_claim: wontClaimTotal,
  };
  const truncated = queuedTotal > counts.queued;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.bucket !== filter) return false;
      if (!needle) return true;
      return [r.name, r.email, r.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      "bucket,name,email,phone,detail",
      ...filtered.map((r) =>
        [BUCKET_META[r.bucket].label, r.name, r.email, r.phone, r.detail]
          .map(esc)
          .join(",")
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offering-${offeringId}-access.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reconciling access…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Buckets */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BUCKET_META) as Bucket[]).map((b) => {
          const meta = BUCKET_META[b];
          const Icon = meta.icon;
          const n = exact[b];
          const on = filter === b;
          return (
            <button
              key={b}
              onClick={() => setFilter(on ? "all" : b)}
              className={`text-left bg-card border rounded-xl p-4 transition-colors ${
                on ? "border-foreground" : "border-border hover:border-foreground/40"
              }`}
              title={meta.blurb}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${meta.tone}`} />
                <span className="text-xs text-muted-foreground">{meta.label}</span>
              </div>
              <div className="text-2xl mt-1">{n}</div>
            </button>
          );
        })}
      </div>

      {wontClaimTotal > 0 && (
        <div className="bg-card border border-red-500/40 rounded-xl p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p>
              <strong>{wontClaimTotal}</strong>{" "}
              {wontClaimTotal === 1 ? "student is" : "students are"} owed this
              offering but will never receive it automatically — their phone
              number isn't Indian, so the OTP claim can't match them. They can
              still sign in by email magic link, but they'll see an empty
              library. Grant each an enrolment directly from{" "}
              <strong>Enrolments</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "All entitlements" : BUCKET_META[filter].blurb}
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email or phone…"
              className="w-64"
            />
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!filtered.length}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {truncated && (
          <p className="text-xs text-amber-500">
            “Queued, unclaimed” lists the {LIST_CAP} most recent of{" "}
            {queuedTotal.toLocaleString()}. The counts above are exact, and
            every “Won't auto-claim” row is listed in full — only this one
            bucket is sampled.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 pr-4 font-medium">State</th>
                <th className="py-2 pr-4 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = BUCKET_META[r.bucket];
                return (
                  <tr key={r.key} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      {r.name || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <div>{r.email}</div>
                      <div className="text-muted-foreground text-xs">{r.phone}</div>
                    </td>
                    <td className={`py-2 pr-4 ${meta.tone}`}>{meta.label}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="text-sm text-muted-foreground py-4">
              Nothing matches this filter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
