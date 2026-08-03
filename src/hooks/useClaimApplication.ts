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
 *  1. DISCOVERY — the argument-free RPC `get_my_pending_claim()`
 *     (20260727120000). It answers the parked rows carrying ONE of the
 *     signed-in caller's own `auth.users` identifiers, as five values and
 *     nothing else: application id, offering id, offering title, the channel
 *     still to prove, and a MASK of that channel's target.
 *
 *     IT IS AN RPC RATHER THAN A TABLE READ ON PURPOSE, and this file used to
 *     do the latter. `cohort_applications` is wide — `bio` is the applicant's
 *     100-word essay (NFR-COPY-1: never in any UI) and `tally_data` is the raw
 *     submission — and the RLS policy that made the table read possible granted
 *     the WHOLE ROW to any caller matching on ONE channel, pre-claim. The
 *     narrow `select=` list this file sent was never the gate; the policy was,
 *     and `select=*` was one request away. The RPC's SELECT list IS the
 *     whitelist, so no applicant PII can reach this client at all.
 *
 *     It takes NO arguments: the matching happens server-side against the
 *     caller's own stored identity, so there is nothing here to filter by and
 *     no enumeration surface to open.
 *  2. SECOND-CHANNEL DERIVATION — which channel still needs proof is DERIVED BY
 *     THE SERVER (`claim_channel`), from the caller's own auth row: the row
 *     channel their identity does NOT already match. It is never sent to the
 *     server, only received. `_shared/identity.ts#canClaim` explicitly cannot
 *     tell a second-channel proof from a replay of the first, so the attach
 *     endpoint re-derives it from the JWT before it trusts anything; what
 *     arrives here is that same derivation, for the UI to render.
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
 * Every read here is fail-soft: if the discovery RPC or the claim function is
 * missing (the server half not deployed yet), discovery resolves to an empty
 * list and NO claim step is ever surfaced. Sign-in is unaffected either way.
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
 * form (the `email_taken` collision is exactly that case), and discovery then
 * makes that row's EXISTENCE known to the stranger (its contents stay on the
 * server — that is what the RPC's whitelist is for). A detour would let an
 * attacker replace
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
import {
  supabase,
  supabasePublishableKey,
  supabaseUrl,
} from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp } from "@/lib/msg91-widget";

/** PINNED ROUTE — S-5's applicant card links to this exact path. */
export const claimRoute = (applicationId: string) => `/claim/${applicationId}`;

/** Privileged claim endpoint (see the contract note above). */
const CLAIM_FUNCTION = "claim-application";

/**
 * Discovery RPC (migration 20260727120000). Argument-free, `authenticated`-only,
 * and its SELECT list is the whitelist — see the header. Named here so the one
 * string that binds this client to that migration is greppable from both sides.
 */
const PENDING_CLAIM_RPC = "get_my_pending_claim";

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
  `${supabaseUrl}/functions/v1/verify-email-otp`;

/** Which channel a claim still needs proof on. */
export type ClaimChannel = "email" | "phone";

/** A parked application the signed-in caller is entitled to try to claim. */
export interface PendingClaim {
  applicationId: string;
  offeringId: string | null;
  offeringTitle: string | null;
  /**
   * The SECOND channel the caller must verify to attach this row, as derived
   * SERVER-SIDE from their own auth identity. Never computed here, never sent.
   */
  channel: ClaimChannel;
  /**
   * The server's mask for that channel's target ("r•••@gmail.com",
   * "••••••3210") — enough to recognise your own value, never the value. The
   * raw address/number is not returned to this client at all.
   */
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
      apikey: supabasePublishableKey,
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

/**
 * One row of `get_my_pending_claim()`. This IS the whole surface the server
 * exposes for discovery — there is no applicant PII in it and no way to ask for
 * any (see the header's note on why this is an RPC and not a table read).
 */
interface PendingClaimRpcRow {
  application_id: string | null;
  offering_id: string | null;
  offering_title: string | null;
  claim_channel: string | null;
  masked_target: string | null;
}

/**
 * The server's `claim_channel`, validated rather than trusted-as-typed.
 *
 * Not defensiveness for its own sake: the RPC is a Postgres `text` column, and
 * a client that runs ahead of (or behind) the migration could be handed a value
 * this build has no UI for. An unknown channel drops the row from discovery
 * rather than rendering a step that cannot complete.
 */
const asClaimChannel = (value: string | null): ClaimChannel | null =>
  value === "email" || value === "phone" ? value : null;

/** Query key root, shared so any consumer can invalidate the discovery read. */
export const pendingClaimsKey = (userId?: string) => ["claim", "pending", userId] as const;

/**
 * The discovery read itself, kept separate from the hook that wraps it so the
 * call and its projection are defined once and stay testable without a
 * QueryClient.
 *
 * Argument-free, because the server matches on the caller's own stored identity
 * (`auth_identity_email()` / `auth_identity_phone10()`): there is nothing to
 * pass, and passing an email/phone would only open an enumeration surface.
 *
 * Never throws and never rejects: an error, an RPC that isn't deployed yet
 * (PGRST202), or no session all resolve to `[]`. The ordering (newest parked row
 * first) is the RPC's, so one consumer taking `[0]` gets the same row every
 * time.
 */
export async function fetchPendingClaims(): Promise<PendingClaim[]> {
  try {
    const { data, error } = await supabase.rpc(PENDING_CLAIM_RPC);
    if (error || !data) return [];

    return (data as PendingClaimRpcRow[]).reduce<PendingClaim[]>((acc, row) => {
      const channel = asClaimChannel(row.claim_channel);
      if (!row.application_id || !channel) return acc;
      acc.push({
        applicationId: row.application_id,
        offeringId: row.offering_id ?? null,
        offeringTitle: row.offering_title ?? null,
        channel,
        maskedTarget: row.masked_target ?? null,
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

  return useQuery<PendingClaim[]>({
    queryKey: pendingClaimsKey(user?.id),
    enabled: !!user,
    staleTime: 60_000,
    // No identity is passed: the RPC reads the caller's own auth row. The key is
    // still scoped by uid so a sign-out/sign-in cannot serve the previous
    // user's answer from cache.
    queryFn: fetchPendingClaims,
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
