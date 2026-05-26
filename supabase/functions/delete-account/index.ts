import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

// ─────────────────────────────────────────────────────────────────────
// delete-account
//
// Required by Google Play's mandatory in-app account-deletion policy.
//
//   POST /functions/v1/delete-account
//   Authorization: Bearer <user JWT>
//
// Soft-deletes the caller: sets public.users.deleted_at = now(), clears
// the PII columns, and signs the caller out on the next request (the
// RLS policy from migration 20260522180000 hides their row once
// deleted_at IS NOT NULL).
//
// A separate Supabase Cron job runs `SELECT cleanup_deleted_users();`
// daily; that function hard-deletes any user whose grace period has
// expired (7 days). See ./README.md for cron setup and the recovery
// procedure for the grace window.
//
// Query parameters:
//
//   ?hard=true  — admin-only escape hatch that performs the hard
//                 delete immediately. Caller must have role = 'admin'
//                 in public.users. NOT exposed in the in-app UI.
//
// Response:
//
//   200 { status: "deleted", recoverable_until: "<ISO8601>" }
//   200 { status: "already_deleted", recoverable_until: "<ISO8601>" }
//   401 { error: "Unauthorized" }
//   403 { error: "Forbidden" }
//   500 { error: "..." }
// ─────────────────────────────────────────────────────────────────────

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GRACE_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonRes({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    // Verify the caller's JWT and extract their user_id via the
    // anon-keyed client. This mirrors the pattern in
    // verify-razorpay-payment/index.ts so we never trust a client-supplied
    // user_id parameter.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.slice("bearer ".length).trim();
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.warn("[delete-account] auth claims failed:", claimsError?.message);
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub as string;

    // Admin (service-role) client is used for the mutation itself
    // because the RLS policy on public.users does not permit a user to
    // null out their own columns en masse — and we also need to write
    // to auth.users for the hard-delete path.
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Parse query params ──
    const url = new URL(req.url);
    const isHardDelete = url.searchParams.get("hard") === "true";

    // ── Check current state ──
    const { data: userRow, error: lookupErr } = await admin
      .from("users")
      .select("id, email, role, deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (lookupErr) {
      console.error("[delete-account] user lookup failed:", lookupErr);
      return jsonRes({ error: "Could not load account" }, 500);
    }
    if (!userRow) {
      // Auth user exists but no public.users row — treat as already
      // gone. Drop the auth row too for cleanliness.
      await admin.auth.admin.deleteUser(userId);
      return jsonRes({ status: "deleted", recoverable_until: null });
    }

    // ── Hard delete (admin escape hatch) ──
    if (isHardDelete) {
      if (userRow.role !== "admin" && userRow.role !== "owner") {
        return jsonRes({ error: "Forbidden" }, 403);
      }

      // Detach payment_orders to satisfy ON DELETE RESTRICT.
      await admin
        .from("payment_orders")
        .update({ user_id: null })
        .eq("user_id", userId);

      // Null out admin-foreign-keyed columns that block the cascade.
      await admin
        .from("refunds")
        .update({ initiated_by: null })
        .eq("initiated_by", userId);

      const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
      if (deleteErr) {
        console.error("[delete-account] hard delete failed:", deleteErr);
        return jsonRes({ error: "Hard delete failed" }, 500);
      }
      return jsonRes({ status: "deleted", recoverable_until: null });
    }

    // ── Soft delete ──
    if (userRow.deleted_at) {
      // Already soft-deleted; return the existing recovery deadline so
      // the caller can render a sensible message.
      const deletedAt = new Date(userRow.deleted_at as unknown as string);
      const recoverable_until = new Date(
        deletedAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
      return jsonRes({
        status: "already_deleted",
        recoverable_until: recoverable_until.toISOString(),
      });
    }

    const now = new Date();
    const recoverable_until = new Date(
      now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
    );

    const { error: updateErr } = await admin
      .from("users")
      .update({
        deleted_at: now.toISOString(),
        full_name: null,
        email: null,
        phone: null,
        avatar_url: null,
        bio: null,
      })
      .eq("id", userId);

    if (updateErr) {
      console.error("[delete-account] soft delete failed:", updateErr);
      return jsonRes({ error: "Could not delete account" }, 500);
    }

    // Best-effort: revoke the caller's active refresh tokens so any
    // other open sessions are signed out immediately. This is
    // belt-and-braces — the frontend already calls supabase.auth.signOut()
    // after our 200 response.
    try {
      await admin.auth.admin.signOut(userId, "global");
    } catch (signOutErr) {
      console.warn("[delete-account] signOut all sessions failed:", signOutErr);
    }

    console.log(
      "[delete-account] soft-deleted user",
      userId,
      "recoverable until",
      recoverable_until.toISOString(),
    );

    return jsonRes({
      status: "deleted",
      recoverable_until: recoverable_until.toISOString(),
    });
  } catch (err: any) {
    console.error("[delete-account] unhandled error:", err?.message || err);
    return jsonRes({ error: err?.message || "Internal error" }, 500);
  }
});
