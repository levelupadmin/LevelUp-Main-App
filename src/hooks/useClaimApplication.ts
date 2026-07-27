/**
 * useClaimApplication — the client half of the identity spine's interactive
 * claim (PHASE SP / S-4), plus the two thin `verify-email-otp` calls the new
 * Email sign-in tab uses. Both live here so the Login page and the claim step
 * share ONE implementation of the email-OTP client contract.
 *
 * Why a claim exists at all: provisioning (S-2, `_shared/identity.ts`) never
 * silent-merges. When a Tally application's email belongs to one auth user and
 * its phone to another (or one of the two is already taken), the row is parked
 * with `user_id` NULL + `pending_claim`, and the tie is broken by the only
 * party who can prove it: the human, at their next interactive sign-in, with
 * ONE additional OTP on the SECOND channel. No admin or support action is part
 * of that path.
 *
 * ── WHAT THIS TALKS TO ──
 *  1. DISCOVERY — a plain SELECT on `cohort_applications`, made possible by
 *     S-2's additive RLS policy `claimants_read_pending_applications`
 *     (20260727120000): a signed-in caller may read an unclaimed
 *     `pending_claim` row that carries THEIR OWN `auth.users` email or phone.
 *     The match happens inside the policy, on the caller's stored identity, so
 *     nothing here may filter by a client-supplied email/phone — that would be
 *     an enumeration hole, and it would not widen what comes back anyway.
 *  2. SECOND-CHANNEL DERIVATION — which channel still needs proof is derived
 *     here purely for the UI: the row channel the caller's own auth identity
 *     does NOT already match. `_shared/identity.ts#canClaim` explicitly cannot
 *     tell a second-channel proof from a replay of the first, so the SERVER
 *     re-derives this from the JWT before it trusts anything. Everything below
 *     is a UX affordance, never the gate.
 *  3. ATTACH + the claim's own code send — `functions.invoke("claim-application")`
 *     (`supabase/functions/claim-application/index.ts`), called with the
 *     caller's JWT:
 *       { application_id, action: "send",  channel: "email", email }
 *         issues a six-digit code to the address the applicant typed. It cannot
 *         reuse `verify-email-otp`'s send: that one only mails an address that
 *         ALREADY resolves to an auth user (it queues by uid), and the
 *         `phone_taken` collision is precisely the case where the application's
 *         email has no account yet.
 *       { application_id, action: "claim", channel, email|phone, code|access_token }
 *         re-verifies the proof SERVER-SIDE (the shared `_shared/otp.ts`
 *         helpers for an email code, the MSG91 access token for a phone code),
 *         re-derives the unproven channel from the JWT, re-runs `canClaim`, and
 *         only then stamps `user_id` with the service role. Answers
 *         `{ claimed: true }` on success and nothing else on failure.
 *  4. EMAIL SIGN-IN — `verify-email-otp` (S-3), used only by the Login tab:
 *     `{ action: "send", email }` then `{ action: "verify", email, code }`.
 *
 * Every read here is fail-soft: if the policy or the function is missing (the
 * server half not deployed yet), discovery resolves to an empty list and NO
 * claim step is ever surfaced. Sign-in is unaffected either way.
 *
 * ── WHAT SURFACES IT ──
 * `usePendingClaims`, read by S-5's applicant card on Home, which links to
 * `claimRoute(applicationId)`. Home is where every sign-in lands, so a parked
 * row IS surfaced at the first interactive sign-in — as a dismissible card the
 * user chooses, NOT as a forced post-login detour.
 *
 * That distinction is load-bearing, and it is why this file no longer exports a
 * "route the user to the claim right after login" helper. A parked row can be
 * created by ANYONE who posts a stranger's email address into the public Tally
 * form (the `email_taken` collision is exactly that case), and RLS then makes
 * that row discoverable by the stranger. A detour would let an attacker replace
 * a real user's landing page with a claim interstitial, at every sign-in,
 * forever, for an application that user never made. A card on Home costs the
 * same one read, is dismissible, and cannot be weaponised that way. It also
 * keeps the Tier-1 login path free of an extra blocking round trip.
 *
 * ── HONEST FAILURE REPORTING ──
 * A wrong code and a code that is right but belongs to someone else's row are
 * deliberately ONE message (an anti-oracle rule) — but ONLY those two, and only
 * when the server actually returned that verdict (401). Everything else the
 * endpoint can answer is a fact about the SERVER, not about the digits: 503
 * `otp_unconfigured` while a secret is unset, 429 when a budget is spent, 500
 * when a lookup fails. Collapsing those into "wrong code" would tell a user who
 * typed the CORRECT code that they did not, on every attempt, with no in-flow
 * remedy — which is precisely the "no admin or support action may be required"
 * criterion this whole flow exists to satisfy. So the status and the error
 * literal are read off the response and reported honestly, and a request that
 * never got an answer at all is its own third case. On the phone channel the
 * access token already earned is kept across any non-verdict failure, so a
 * retry does not need a fresh SMS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp } from "@/lib/msg91-widget";

/** PINNED ROUTE — S-5's applicant card links to this exact path. */
export const claimRoute = (applicationId: string) => `/claim/${applicationId}`;

/** Privileged claim endpoint (see the contract note above). */
const CLAIM_FUNCTION = "claim-application";

/** Everything the claim endpoint ever says on success. */
type ClaimResponse = { claimed?: boolean; status?: string } | null;

/**
 * What the endpoint actually said.
 *
 *  • `ok`         — a 2xx, with whatever body came back.
 *  • `answered`   — an HTTP response we can quote: `status` is the code and
 *                   `code` the `error` literal in the body, when there was one.
 *                   ONLY a 401 here is a verdict about the user's code.
 *  • `unreachable`— nothing ever answered (offline, relay error, function not
 *                   deployed). We know nothing about the code.
 */
type InvokeOutcome =
  | { kind: "ok"; data: ClaimResponse }
  | { kind: "answered"; status: number; code: string | null }
  | { kind: "unreachable" };

// Absolute function URL, mirroring the phone path in Login.tsx/Signup.tsx. The
// project URL is hard-coded across this app on purpose (see
// integrations/supabase/client.ts — stale Vercel env vars once shipped the
// wrong project), and this is an unauthenticated login endpoint, so it is
// called with the publishable key rather than the session.
const VERIFY_EMAIL_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-email-otp";

/** Which channel a claim still needs proof on. */
export type ClaimChannel = "email" | "phone";

/** A parked application the signed-in caller is entitled to try to claim. */
export interface PendingClaim {
  applicationId: string;
  offeringId: string | null;
  offeringTitle: string | null;
  /** The SECOND channel the caller must verify to attach this row. */
  channel: ClaimChannel;
  /** Masked hint for that channel, never the full value. */
  maskedTarget: string | null;
}

/** Uniform result shape for every action below (these never throw). */
export type ClaimResult = { ok: true } | { ok: false; error: string };

export interface EmailOtpSession {
  access_token: string;
  refresh_token: string;
}

export type EmailOtpVerifyResult =
  | { ok: true; session: EmailOtpSession }
  | { ok: false; error: string };

// ONE message for every REJECTED attach: a wrong code and a code that is right
// but belongs to a different application must be indistinguishable, or the
// screen becomes an oracle for "does this identifier own that application".
// The endpoint returns exactly one status for that whole class — 401 — so this
// message is reachable only from a 401.
const CLAIM_REJECTED = "That code doesn't match this application. Nothing was linked.";

// ...but a server we could not REACH is a different fact, and reporting it as a
// wrong code is a lie that costs the user their code (on the phone channel the
// MSG91 OTP is already consumed by the time we get here). The anti-oracle rule
// says a rejection must not distinguish "wrong digits" from "not your row"; it
// says nothing about a 404 on an undeployed function or a dead network.
const CLAIM_UNREACHABLE =
  "We couldn't reach the server, so nothing was linked. Please try again in a moment.";

// A server that answered, but with "I am not configured for this" (503, e.g.
// EMAIL_OTP_PEPPER or MSG91_AUTH_KEY unset) or "I broke" (500). The user's code
// was never even looked at, so nothing about their digits may be implied.
const CLAIM_UNAVAILABLE =
  "Confirming isn't available right now, so nothing was linked. Please try again later.";

// A budget was spent. Concrete, because vague advice here ("please try again")
// is what makes a locked-out user keep retrying and keep spending it. The
// binding ceiling on the verify path is the per-caller hourly failure budget.
const CLAIM_TOO_MANY_TRIES =
  "Too many tries. Wait about an hour, then try again. Nothing was linked.";

const GENERIC_SEND_ERROR = "We couldn't send the code. Please try again.";

// The send path's own budget is a 15-minute window, so say that rather than
// inviting the retry that keeps it exhausted.
const SEND_TOO_MANY =
  "You've asked for too many codes. Wait about 15 minutes, then try again.";

const SEND_UNAVAILABLE =
  "We can't send a code right now. Please try again in a few minutes.";

/**
 * The honest sentence for a server-answered non-2xx on the ATTACH path.
 *
 * Only 401 is a verdict about the code the user typed (the endpoint answers
 * `claim_rejected` with 401 for wrong code, not-your-row, already-claimed and
 * wrong-channel alike — that collapse is deliberate and stays). Every other
 * status is a fact about the server: reporting it as a wrong code strands a
 * user who typed the CORRECT digits with no in-flow way out, which would break
 * the "no admin or support action may be required" rule this flow is built on.
 */
export function attachFailureMessage(status: number, code: string | null): string {
  // The one shape-check the server does on the digits themselves. The OTP input
  // makes it unreachable from this app, but it IS about the code, so it reads
  // as one rather than as a server fault.
  if (code === "invalid_code_format") return CLAIM_REJECTED;
  if (status === 401 || status === 403) return CLAIM_REJECTED;
  if (status === 429 || code === "too_many_requests") return CLAIM_TOO_MANY_TRIES;
  // 503 = a required secret is unset; 5xx = a lookup, the rate limiter or the
  // attach itself failed. Same user-visible truth: not your code, try later.
  return CLAIM_UNAVAILABLE;
}

/** The same, for the claim's own send path. */
export function sendFailureMessage(status: number, code: string | null): string {
  if (status === 429 || code === "too_many_requests") return SEND_TOO_MANY;
  if (status === 503 || code === "otp_unconfigured") return SEND_UNAVAILABLE;
  if (status >= 500) return SEND_UNAVAILABLE;
  return GENERIC_SEND_ERROR;
}

/**
 * Turn whatever `functions.invoke` rejected with into the two facts the callers
 * need: did the server answer, and what did it say?
 *
 * `FunctionsHttpError` carries the raw `Response` on `.context` — the ONLY
 * place the status and the `{ error: … }` literal survive, since `invoke`
 * discards the body for any non-2xx. `FunctionsFetchError` (no network) and
 * `FunctionsRelayError` (the relay never reached the function) carry no verdict
 * at all and must stay "unreachable".
 */
async function describeFunctionError(error: unknown): Promise<InvokeOutcome> {
  if (!(error instanceof FunctionsHttpError)) return { kind: "unreachable" };
  const resp = error.context as Response | undefined;
  if (!resp || typeof resp.status !== "number") return { kind: "unreachable" };
  let code: string | null = null;
  try {
    const body = (await resp.json()) as { error?: unknown } | null;
    if (typeof body?.error === "string") code = body.error;
  } catch {
    // A non-JSON or already-drained body still leaves us the status, which is
    // enough to tell a verdict from a server fault.
  }
  return { kind: "answered", status: resp.status, code };
}

// Shared mapping for the code errors verify-email-otp returns. Anything
// unrecognised collapses to the generic line, so a server detail can never leak
// into the UI. `invalid_code` is deliberately the same message for "wrong
// digits" and "no code on file for this address" — the endpoint returns one
// literal for both, and so must we.
const emailOtpError = (code: unknown): string => {
  switch (code) {
    case "invalid_code":
    case "invalid_code_format":
      return "Wrong code. Try again.";
    case "code_expired":
      return "That code has expired. Send a new one.";
    case "code_already_used":
      return "That code was already used. Send a new one.";
    case "too_many_attempts":
    case "too_many_requests":
      return "Too many attempts. Wait about an hour, then try again.";
    // Server faults, not the user's digits. Same rule as the attach path: a
    // misconfigured or broken endpoint must never be reported as a wrong code,
    // or a user typing the right one is told forever that they are not.
    case "otp_unconfigured":
    case "rate_limit_unavailable":
    case "lookup_failed":
    case "session_mint_failed":
      return "Signing in by email isn't available right now. Please try again later.";
    default:
      return "We couldn't verify that code. Try again.";
  }
};

async function postEmailOtp(body: Record<string, unknown>): Promise<Response> {
  return fetch(VERIFY_EMAIL_OTP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Send a six-digit SIGN-IN code to `email` (S-3's endpoint). The response is
 * byte-identical for a known and an unknown address, so this resolves `ok` on
 * any 2xx and never reports whether an account exists.
 */
export async function sendEmailOtp(email: string): Promise<ClaimResult> {
  try {
    const resp = await postEmailOtp({ action: "send", email });
    if (!resp.ok) {
      // Read WHY. A 429 and a 503 are facts the user can act on ("wait", "come
      // back later"); collapsing them into "please try again" is advice that
      // invites the retry which keeps the budget exhausted.
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: sendFailureMessage(resp.status, body?.error ?? null) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_SEND_ERROR };
  }
}

/**
 * Verify an emailed sign-in code and return the session tokens S-3 minted. The
 * CALLER owns `supabase.auth.setSession` and the post-auth destination, exactly
 * as the phone path does — this helper only speaks to the endpoint.
 */
export async function verifyEmailOtpForSession(
  email: string,
  code: string,
): Promise<EmailOtpVerifyResult> {
  try {
    const resp = await postEmailOtp({ action: "verify", email, code });
    const data = (await resp.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string; error?: string }
      | null;
    if (!resp.ok || !data?.access_token || !data?.refresh_token) {
      return { ok: false, error: emailOtpError(data?.error) };
    }
    return {
      ok: true,
      session: { access_token: data.access_token, refresh_token: data.refresh_token },
    };
  } catch {
    return { ok: false, error: emailOtpError(undefined) };
  }
}

// ── Identity keys ── the same normalisation `_shared/identity.ts` uses, so a
// row storing "9788385577" and an auth identity of "+91 97883 85577" compare
// equal. Inlined (not imported) for the same reason that module is import-free:
// this is four lines of string handling, not a dependency.
const emailKey = (value: string | null | undefined): string | null => {
  const v = (value ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
};

const phoneKey = (value: string | null | undefined): string | null => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** "anu@example.com" → "a•••@example.com". Display only. */
const maskEmail = (value: string): string => {
  const [local, domain] = value.trim().split("@");
  if (!domain) return value.trim();
  return `${local.slice(0, 1)}•••@${domain}`;
};

/** "+919788385577" → "+91 ••••• ••577". Display only (mirrors OtpEntryStep). */
const maskPhone = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value.trim();
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : "+91";
  return `${cc} ••••• ••${digits.slice(-3)}`;
};

/** The shape discovery reads off `cohort_applications`. */
interface PendingClaimRow {
  id: string;
  offering_id: string | null;
  email: string | null;
  phone: string | null;
  offerings?: { title: string | null } | null;
}

/** The caller's own identity, as stored on their auth user. */
export interface CallerIdentity {
  email: string | null;
  phone: string | null;
}

/**
 * Which channel this caller still has to prove for this row — i.e. the row
 * channel their OWN auth identity does not already match.
 *
 * Returns null (nothing claimable in-flow) when:
 *   • the second channel is blank on the row, so no OTP could ever satisfy
 *     `canClaim` for it, or
 *   • neither channel matches the caller, which RLS should already prevent, or
 *   • BOTH channels already match the caller. That last one looks like the
 *     easiest case and is in fact the one case this screen must refuse: there
 *     is no channel left that the caller has NOT proved, and the server
 *     re-derives the unproven channel from the JWT before it trusts anything
 *     (`_shared/identity.ts#canClaim`'s warning is explicit that asking for a
 *     channel the caller already holds is the replay that defeats the collision
 *     defer). Rendering an OTP step here would be a code entry that cannot
 *     succeed no matter what the user types. Nothing is lost by returning null:
 *     the row is untouched and still parked.
 */
export function deriveClaimChannel(
  row: Pick<PendingClaimRow, "email" | "phone">,
  caller: CallerIdentity,
): { channel: ClaimChannel; maskedTarget: string | null } | null {
  const rowEmail = emailKey(row.email);
  const rowPhone = phoneKey(row.phone);
  const provenEmail = rowEmail !== null && rowEmail === emailKey(caller.email);
  const provenPhone = rowPhone !== null && rowPhone === phoneKey(caller.phone);

  if (provenEmail && provenPhone) return null;
  if (provenEmail && rowPhone) {
    return { channel: "phone", maskedTarget: maskPhone(row.phone as string) };
  }
  if (provenPhone && rowEmail) {
    return { channel: "email", maskedTarget: maskEmail(row.email as string) };
  }
  return null;
}

/** Query key root, shared so any consumer can invalidate the discovery read. */
export const pendingClaimsKey = (userId?: string) => ["claim", "pending", userId] as const;

/**
 * The discovery read itself, kept separate from the hook that wraps it so the
 * query and the channel derivation are defined once and stay testable without a
 * QueryClient.
 *
 * Never throws and never rejects: an error, a policy that isn't deployed yet,
 * or no session all resolve to `[]`.
 */
export async function fetchPendingClaims(caller: CallerIdentity): Promise<PendingClaim[]> {
  try {
    // No identifier filter on purpose: `claimants_read_pending_applications`
    // does the matching against the caller's own auth.users row. Passing an
    // email/phone here would add an enumeration surface and nothing else.
    const { data, error } = await supabase
      .from("cohort_applications")
      .select("id, offering_id, email, phone, offerings(title)")
      .eq("pending_claim", true)
      .is("user_id", null)
      .order("created_at", { ascending: false });
    if (error || !data) return [];

    return (data as PendingClaimRow[]).reduce<PendingClaim[]>((acc, row) => {
      const derived = deriveClaimChannel(row, caller);
      if (!derived) return acc;
      acc.push({
        applicationId: row.id,
        offeringId: row.offering_id ?? null,
        offeringTitle: row.offerings?.title ?? null,
        channel: derived.channel,
        maskedTarget: derived.maskedTarget,
      });
      return acc;
    }, []);
  } catch {
    return [];
  }
}

/**
 * Every application parked for the signed-in caller to claim. Fail-soft (see
 * `fetchPendingClaims`): failures render as "nothing to claim" rather than a
 * spinner or a thrown boundary.
 *
 * THIS IS THE ONLY DISCOVERY SURFACE, and it is deliberately mounted on Home
 * (through S-5's applicant card), never on the login path. A blocking read
 * between "session minted" and "route painted" would put a Tier-1 regression on
 * every existing user's sign-in for a feature almost none of them will ever
 * use, and the interstitial it fed could be aimed at any user by anyone willing
 * to type their email into the public Tally form. Abandonment still needs no
 * bookkeeping: the row is only ever mutated by a successful attach, so a user
 * who walks away sees the same card at their next sign-in.
 */
export function usePendingClaims() {
  const { user } = useAuth();
  const identityEmail = user?.email ?? null;
  const identityPhone = user?.phone ?? null;

  return useQuery<PendingClaim[]>({
    queryKey: pendingClaimsKey(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => fetchPendingClaims({ email: identityEmail, phone: identityPhone }),
  });
}

export interface ClaimController {
  /** True while discovery is still resolving. */
  loading: boolean;
  /** The parked row for `applicationId`, or null once we know there isn't one. */
  claim: PendingClaim | null;
  /** Email channel: send the six-digit code to the address the user typed. */
  sendEmailCode: (email: string) => Promise<ClaimResult>;
  /** Email channel: verify the code and attach the application (server-gated). */
  claimWithEmail: (email: string, code: string) => Promise<ClaimResult>;
  /** Phone channel: start the MSG91 widget on the number the user typed. */
  sendPhoneCode: (phone: string) => Promise<ClaimResult>;
  /** Phone channel: verify the code and attach the application (server-gated). */
  claimWithPhone: (code: string) => Promise<ClaimResult>;
}

/**
 * Drive ONE application's claim. The user proves the second channel by typing
 * their own identifier and the code sent to it; the server decides whether that
 * proof entitles them to the row. A rejection attaches nothing and merges
 * nothing, and an abandoned attempt writes nothing at all — the row stays
 * parked and surfaces again at the next sign-in.
 */
export function useClaimApplication(applicationId: string | undefined): ClaimController {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: claims, isLoading } = usePendingClaims();

  // The number the MSG91 widget was started with, so the verify step sends the
  // value the user actually proved rather than re-reading a moving input.
  const phoneRef = useRef<string>("");
  // The MSG91 access token this session has already earned. Held so that a
  // TRANSPORT failure on the attach does not strand the user: `widgetVerifyOtp`
  // consumes the OTP, so re-typing the same digits would fail at the widget and
  // a correct code would look wrong forever. Cleared whenever a fresh code is
  // sent, so it can never outlive the proof it stands for.
  const accessTokenRef = useRef<string | null>(null);

  const found = useMemo(
    () => claims?.find((c) => c.applicationId === applicationId) ?? null,
    [claims, applicationId],
  );

  // Once the attach succeeds the row stops being a pending claim, so the
  // discovery query — which is MOUNTED HERE and therefore active — refetches it
  // away and `found` goes null. Without this latch the screen would swap the
  // "Linked" choreography for the neutral "nothing to confirm" card in the
  // middle of the success beat. The last row we saw is what the success state
  // is about, so keep rendering it until the page navigates away.
  const [attached, setAttached] = useState(false);
  const lastSeen = useRef<PendingClaim | null>(null);
  useEffect(() => {
    if (found) lastSeen.current = found;
  }, [found]);
  const claim = found ?? (attached ? lastSeen.current : null);

  const invokeClaim = useCallback(
    async (body: Record<string, unknown>): Promise<InvokeOutcome> => {
      if (!applicationId) return { kind: "unreachable" };
      try {
        const { data, error } = await supabase.functions.invoke(CLAIM_FUNCTION, {
          body: { application_id: applicationId, ...body },
        });
        // functions-js throws FunctionsHttpError for EVERY non-2xx, not just
        // the 401 verdict — a 503 `otp_unconfigured`, a 429 and a 500 all
        // arrive as the same class. Treating the class as "rejected" is what
        // told a correct code it was wrong; the status and the body are the
        // only things that can tell them apart, so read them.
        if (error) return await describeFunctionError(error);
        return { kind: "ok", data: (data ?? null) as ClaimResponse };
      } catch {
        return { kind: "unreachable" };
      }
    },
    [applicationId],
  );

  const attach = useCallback(
    async (body: Record<string, unknown>): Promise<ClaimResult> => {
      const res = await invokeClaim({ action: "claim", ...body });
      // We never spoke to the server, so we know nothing about the code the
      // user typed. Say that, rather than blaming their digits.
      if (res.kind === "unreachable") return { ok: false, error: CLAIM_UNREACHABLE };
      if (res.kind === "answered") {
        return { ok: false, error: attachFailureMessage(res.status, res.code) };
      }
      // A 2xx that isn't `{ claimed: true }` is not a shape this endpoint
      // produces; treat it as the server having said nothing usable.
      if (res.data?.claimed !== true) return { ok: false, error: CLAIM_UNAVAILABLE };

      setAttached(true);
      // The row just left `pending_claim`: drop the discovery cache so an
      // abandoned-then-completed claim can't re-surface from a stale read, and
      // let the applicant surfaces re-read the now-attached row. Deliberately
      // NOT awaited — react-query refetches active queries on invalidate, and
      // awaiting that would hold the success result behind the very refetch
      // that empties this screen.
      void queryClient.invalidateQueries({ queryKey: pendingClaimsKey(user?.id) });
      accessTokenRef.current = null;
      return { ok: true };
    },
    [invokeClaim, queryClient, user?.id],
  );

  const sendEmailCode = useCallback(
    async (email: string): Promise<ClaimResult> => {
      const res = await invokeClaim({ action: "send", channel: "email", email });
      // Like the sign-in send, a 2xx is the same for an address that matches
      // the parked row and one that doesn't — that anti-oracle collapse stays.
      // What does NOT stay is collapsing the failures with it: a spent budget
      // (429) and an unconfigured server (503) are things the user can act on,
      // and "please try again" is the one piece of advice that makes both worse.
      if (res.kind === "unreachable") return { ok: false, error: GENERIC_SEND_ERROR };
      if (res.kind === "answered") {
        return { ok: false, error: sendFailureMessage(res.status, res.code) };
      }
      return { ok: true };
    },
    [invokeClaim],
  );

  const claimWithEmail = useCallback(
    (email: string, code: string) => attach({ channel: "email", email, code }),
    [attach],
  );

  const sendPhoneCode = useCallback(async (phone: string): Promise<ClaimResult> => {
    try {
      await initMsg91();
      await widgetSendOtp(phone);
      phoneRef.current = phone;
      // A new code supersedes whatever the previous one proved.
      accessTokenRef.current = null;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : GENERIC_SEND_ERROR };
    }
  }, []);

  const claimWithPhone = useCallback(
    async (code: string): Promise<ClaimResult> => {
      if (!accessTokenRef.current) {
        try {
          const res = await widgetVerifyOtp(code);
          accessTokenRef.current = res.accessToken;
        } catch {
          // A widget rejection is a wrong or expired code: same generic line, so
          // the two failure modes stay indistinguishable.
          return { ok: false, error: CLAIM_REJECTED };
        }
      }
      return attach({
        channel: "phone",
        phone: phoneRef.current,
        access_token: accessTokenRef.current,
      });
    },
    [attach],
  );

  return {
    loading: isLoading,
    claim,
    sendEmailCode,
    claimWithEmail,
    sendPhoneCode,
    claimWithPhone,
  };
}
