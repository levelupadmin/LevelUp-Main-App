/**
 * email-unsubscribe — the opt-out link every re-entry email carries (PHASE RE, U-1).
 *
 * A person clicks this from their inbox. It is therefore a PAGE, not an API: it
 * answers in HTML that a human can read, and it never returns JSON.
 *
 * ── WHAT IT STOPS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
 * It stops the re-entry reminder ladder for one address, and nothing else. The
 * write is a single `used_at` stamp on that address's row in
 * `public.email_unsubscribe_tokens`, which `cohort-reentry-cron` reads (once
 * per page, and again immediately before dispatch) as "stop".
 *
 * It does NOT insert into `public.suppressed_emails`, and that omission is the
 * design, not an oversight. `suppressed_emails` is one undifferentiated list
 * with no category column; `queue-transactional-email` hard-gates EVERY
 * transactional send on it (`index.ts` returns a 200 "Email suppressed" so
 * callers never even learn the mail was dropped), and `verify-razorpay-payment`
 * and `notify-cohort` both post through that endpoint. Writing an unsubscribe
 * there would mean one click on a fee reminder also killed the same person's
 * payment receipt and their cohort notifications — silently, and permanently,
 * because the table's own DDL is append-only by design ("no DELETE or UPDATE
 * policies to prevent bypassing suppression"). Every line of copy this endpoint
 * and the six email bodies show says "these reminders", so the mechanism is
 * scoped to match the promise.
 *
 * THE CONSEQUENCE, AND IT IS NOT A FOOTNOTE: `send-bulk-email` is a SECOND,
 * INDEPENDENT producer, and the only opt-out list it consults is
 * `fetchSuppressedSet` over `suppressed_emails`. So somebody who clicks a link
 * labelled "Unsubscribe" here and is shown "You are unsubscribed" CAN STILL
 * RECEIVE A BULK MARKETING CAMPAIGN. Two things follow, and both are done
 * rather than intended:
 *   • the pages below say it in as many words, and offer the write-to-support
 *     path that does stop everything. A page that promised more than the
 *     mechanism delivers would be the actual defect;
 *   • whether a reminder opt-out SHOULD also suppress marketing is a product
 *     decision (it costs receipts, irreversibly, under today's schema), so it
 *     is flagged for a decision rather than taken here by a code comment.
 * The trade the other way — a reminder opt-out that irreversibly destroys
 * receipts — is not one to make on a person's behalf from a single click.
 *
 * IT IS REVERSIBLE. `email_unsubscribe_tokens` carries a service-role UPDATE
 * policy, so clearing `used_at` genuinely undoes this, which is what makes the
 * "write to support" line on the page below an offer rather than a platitude.
 *
 * ── WHY `verify_jwt = false` (supabase/config.toml) ─────────────────────────
 * This is an UNAUTHENTICATED LINK IN AN EMAIL. The person opening it has a mail
 * client, not a Supabase session, and there is no key to put in the URL that
 * would not itself be public. Same reason as `razorpay-webhook`,
 * `auth-email-hook` and `tally-application-webhook`: the caller cannot hold a
 * project JWT, so the gate has to be inside the handler.
 *
 * And it is the SAME KIND of gate those two webhooks use — an HMAC checked in
 * constant time BEFORE the database is touched. The link carries a credential,
 * `<token>.<tag>`, where the tag is `HMAC-SHA256(UNSUBSCRIBE_TOKEN_SECRET,
 * "v1:tag:<token>")` truncated to 22 base64url characters. A credential nobody
 * could have produced without the secret is rejected by
 * `verifyUnsubscribeCredential` with no client built and no query issued, so a
 * stranger cannot buy an unauthenticated service-role SELECT with a guessed
 * 43-character string. Only past that gate is the token hashed and looked up.
 * Blast radius of a genuine credential: "this address stops receiving cohort
 * reminders, reversibly". Nothing here reads an applicant, a payment or a user
 * — it does not even read the address.
 *
 * ── IT ACCEPTS THE PREVIOUS SECRET, BECAUSE ROTATION IS OTHERWISE AN OUTAGE ──
 * One key drives the token AND the tag, so a new `UNSUBSCRIBE_TOKEN_SECRET`
 * invalidates every link already sitting in an inbox. This endpoint therefore
 * verifies against `UNSUBSCRIBE_TOKEN_SECRET` and, when it is set,
 * `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` — both tried, neither short-circuiting,
 * so the work does not depend on which key signed a credential. That keeps
 * delivered links alive across a key change for as long as the old value stays
 * configured. It does not make rotation free: once the sender rotates an
 * address's ROW onto the new key, links in messages already delivered to that
 * address stop matching, and this endpoint cannot say so without becoming the
 * oracle the next section rules out. The procedure (set PREVIOUS in the same
 * change, keep it a full ladder window) is in `_shared/unsubscribe.ts`.
 *
 * ── GET DOES NOT UNSUBSCRIBE. THAT IS THE POINT. ────────────────────────────
 * Mail clients, security scanners, link-preview bots and corporate proxies
 * fetch every URL in a message before a human ever sees it. A bare GET that
 * suppressed on sight would unsubscribe people who never clicked, and we would
 * never know: the ladder would just go quiet.
 *
 * So GET renders a confirmation page whose button POSTs the credential back,
 * and ONLY the POST writes. A prefetcher issues the GET, gets a static page,
 * and changes nothing. This is the "POST on confirm" option, chosen over a
 * signed-GET-with-a-nonce because the nonce would still be in the URL a
 * prefetcher follows. It stays one click for the human: open the link, press
 * the button.
 *
 * NO RFC 8058 CLAIM IS MADE HERE. `_shared/email.ts` puts the credential on the
 * pgmq payload because `process-email-queue:284` already forwards
 * `payload.unsubscribe_token` to `sendLovableEmail`, and fitting the field that
 * exists beats inventing a parallel one — but nothing in this repository emits
 * a `List-Unsubscribe` or `List-Unsubscribe-Post` header (`grep -rn
 * 'List-Unsubscribe' supabase/` is empty), and `npm:@lovable.dev/email-js` —
 * the sender `process-email-queue` hands the payload to — is absent from this
 * repo's package.json and so cannot be read here, so whether
 * one-click-from-the-inbox ever reaches this endpoint is UNVERIFIED. Nothing depends on it. The load-bearing path is
 * the link in the body, which we render ourselves. The query-string read below
 * exists for a reason that IS verified: the confirmation form posts to `action=""`,
 * which preserves the query string, so a self-post carries the credential in
 * both places and either is a valid place to find it.
 *
 * ── NO ENUMERATION ORACLE ───────────────────────────────────────────────────
 * An unknown, superseded, unsigned or already-used credential produces a
 * response BYTE IDENTICAL to a valid one: same status, same HTML, on both GET
 * and POST. Nobody can point this endpoint at a guessed credential to learn
 * whether an address is on file, because the answer never varies. Two
 * consequences, both deliberate:
 *   • the confirmation page cannot name the address it is about (it does not
 *     know one, ever — the row's `email` column is not even selected);
 *   • "already unsubscribed" is reported as success, which is also what
 *     idempotency requires. Clicking twice is success, not an error.
 *
 * The two permitted asymmetries, and why neither is an oracle:
 *   1. A credential that fails the tag check skips the database round trip.
 *      Failing it requires only NOT having the secret, which is the state every
 *      attacker is in for every input, so the timing difference partitions
 *      nothing about which addresses exist. The RESPONSE is still identical.
 *   2. A database failure during the write returns an honest error page. It is
 *      only reachable with a credential that both verified and matched, so in
 *      principle it distinguishes — but an attacker cannot induce it, and the
 *      alternative is telling a real person "you are unsubscribed" when the
 *      write did not land. Lying to somebody who asked us to stop is the worse
 *      failure.
 *
 * ── SECURITY POSTURE OF THIS FILE ───────────────────────────────────────────
 *   • Service-role client, because `email_unsubscribe_tokens` is
 *     service-role-only under RLS and anon cannot read it. The credential is
 *     the authorisation; the key never leaves the function.
 *   • The address is never read, never logged, never echoed into the page,
 *     never put in a URL. Logs carry the token ROW ID and the outcome.
 *   • The POST body is read through a bounded reader that stops at
 *     `MAX_BODY_BYTES`, so an oversized or endless body is abandoned rather
 *     than buffered whole.
 *   • `Cache-Control: no-store` + `X-Robots-Tag: noindex` + `Referrer-Policy:
 *     no-referrer` so the credential is not cached by a proxy, indexed, or
 *     handed to a third party in a Referer header. The page loads no external
 *     resource, runs no script, and posts only to itself.
 *   • No CORS headers: this is a top-level navigation and a same-document form
 *     POST, never an XHR from the app. Adding an allow-origin would only invite
 *     one.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  hashUnsubscribeToken,
  isWellFormedUnsubscribeCredential,
  UNSUBSCRIBE_QUERY_PARAM,
  unsubscribeSecretCandidates,
  verifyUnsubscribeCredential,
} from "../_shared/unsubscribe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * The keys a delivered link may have been signed with, current first. Needed
 * here for the pre-database tag check and for nothing else: identifying the row
 * is a hash lookup, which needs no secret. Secrets by name only.
 *
 * `UNSUBSCRIBE_TOKEN_SECRET` is the one `cohort-reentry-cron` mints with.
 * `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` is OPTIONAL and exists solely so a key
 * rotation does not instantly break every link already in an inbox; it is
 * unset in the ordinary case, and `unsubscribeSecretCandidates` drops anything
 * absent or too short, so a list of one is the normal state.
 */
const UNSUBSCRIBE_SECRETS = unsubscribeSecretCandidates(
  Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET"),
  Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS"),
);

/**
 * Ceiling on what this endpoint will read from a request body. One
 * 66-character field, so anything past 4 KB cannot be a legitimate submission,
 * and reading is ABANDONED at the ceiling rather than buffered and sliced.
 */
const MAX_BODY_BYTES = 4096;

function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

/**
 * The client type the helpers below take. Derived from the factory rather than
 * spelled out, exactly as `cohort-reentry-cron` does it: a hand-written
 * `SupabaseClient<any, any, any>` would need three `no-explicit-any`
 * suppressions, and a bare `ReturnType<typeof createClient>` infers different
 * schema generics at a call site than in a signature, which `deno check`
 * rejects. This one form satisfies both gates.
 */
type Admin = ReturnType<typeof createAdminClient>;

/** One structured log line, so this endpoint is greppable. Never an address. */
function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ fn: "email-unsubscribe", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Belt and braces. The only value interpolated below is a credential that
 * already cleared `UNSUBSCRIBE_CREDENTIAL_RE` (`[A-Za-z0-9_-]` and one dot,
 * nothing escapable in it), but a validator and an escaper are cheap and the
 * next person to add a field here should find the escaper already in place.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlRes(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * The page shell. Deliberately plain and self-contained: inline styles only, no
 * webfont, no image, no script, so it renders identically from a stripped-down
 * mail-client browser and cannot leak a request to a third party. No em dashes
 * in any of the copy (LevelUp copy rule).
 */
function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · LevelUp Learning</title>
</head>
<body style="margin:0;background:#0f0f0f;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.55;">
<div style="max-width:520px;margin:0 auto;padding:48px 24px;">
<p style="margin:0 0 28px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4af37;">LevelUp Learning</p>
${bodyHtml}
</div>
</body>
</html>`;
}

/**
 * GET: ask first. Nothing has been written when this renders, and the scope of
 * what the button does is spelled out before it is pressed rather than after —
 * including the part that is smaller than the word "unsubscribe" implies.
 */
function confirmPage(credential: string): string {
  const safe = escapeHtml(credential);
  return page(
    "Unsubscribe",
    `<h1 style="margin:0 0 16px;font-size:26px;font-weight:600;">Stop these reminders?</h1>
<p style="margin:0 0 20px;color:#c9c9c9;">You are about to opt out of the application reminder emails for your LevelUp cohort application. Press the button and we will stop sending them.</p>
<p style="margin:0 0 20px;color:#c9c9c9;">Nothing else changes. Your application stays exactly as it is, and you will still get the things you would want: payment receipts, and anything about a course you have already bought.</p>
<p style="margin:0 0 28px;color:#c9c9c9;">This button covers the reminders only. Announcements and other LevelUp emails are a separate list, so if you would rather hear nothing from us at all, write to support@leveluplearning.in and we will take you off everything.</p>
<form method="POST" action="">
<input type="hidden" name="${UNSUBSCRIBE_QUERY_PARAM}" value="${safe}">
<button type="submit" style="display:inline-block;background:#d4af37;color:#000;border:0;padding:13px 24px;border-radius:6px;font-weight:600;font-size:15px;cursor:pointer;">Yes, unsubscribe me</button>
</form>
<p style="margin:28px 0 0;color:#8a8a8a;font-size:13px;">Nothing has changed yet. Close this page and you stay subscribed.</p>`,
  );
}

/**
 * POST: the same page for every outcome that is not a server fault. A
 * credential we have never seen, an unsigned one, a superseded one and a second
 * click on a working one all land here, which is what makes the endpoint both
 * idempotent and free of an enumeration oracle.
 */
function donePage(): string {
  return page(
    "Unsubscribed",
    `<h1 style="margin:0 0 16px;font-size:26px;font-weight:600;">You are unsubscribed.</h1>
<p style="margin:0 0 20px;color:#c9c9c9;">We will not send you any more application reminder emails. If one is already on its way it may still arrive, but nothing further will follow.</p>
<p style="margin:0 0 20px;color:#c9c9c9;">This covers the reminders only. Your application is untouched, you can still finish it any time from the app, and receipts for anything you pay for will still reach you.</p>
<p style="margin:0 0 20px;color:#c9c9c9;">Announcements and other LevelUp emails are a separate list and are not affected by this. To come off everything, write to support@leveluplearning.in and we will do it by hand.</p>
<p style="margin:28px 0 0;color:#8a8a8a;font-size:13px;">Clicked this by mistake? Write to support@leveluplearning.in and we will turn the reminders back on.</p>`,
  );
}

/** The one honest failure. See the "permitted asymmetries" note in the header. */
function errorPage(): string {
  return page(
    "Something went wrong",
    `<h1 style="margin:0 0 16px;font-size:26px;font-weight:600;">We could not complete that.</h1>
<p style="margin:0 0 20px;color:#c9c9c9;">Something went wrong on our side, so we have not recorded anything yet. Please open the link again in a few minutes.</p>
<p style="margin:0 0 20px;color:#c9c9c9;">If it keeps failing, write to support@leveluplearning.in and we will stop the reminders by hand.</p>`,
  );
}

/**
 * A token row, as the consumer needs to see it — which is as little as
 * possible. The `email` column is NOT selected: this endpoint no longer has any
 * use for the address, so the least it can do is not fetch it.
 */
interface TokenRow {
  id: string;
  used_at: string | null;
}

/**
 * Look the presented token up by HASH. The plaintext is never stored, so this
 * is the only lookup there is — and it is also why a legacy row's plaintext
 * `token` column (nothing has ever written one) is inert: it is not consulted.
 * Only reached for a credential that already passed the tag check.
 */
async function findTokenRow(
  admin: Admin,
  token: string,
): Promise<{ row: TokenRow | null; failed: boolean }> {
  const tokenHash = await hashUnsubscribeToken(token);
  const { data, error } = await admin
    .from("email_unsubscribe_tokens")
    .select("id, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    // A read failure is NOT "no such token": answering "you are unsubscribed"
    // off a failed read would be a lie to somebody who asked us to stop.
    log("error", "token_read_failed", { message: error.message });
    return { row: null, failed: true };
  }
  return { row: (data as unknown as TokenRow | null) ?? null, failed: false };
}

/**
 * Record the opt-out. `used_at` carries two jobs and both are honest: it is the
 * record of WHEN this person first asked us to stop, and it is the marker
 * `cohort-reentry-cron` reads to stop. It is never a gate HERE — a second click
 * finds it already set, writes nothing and still reports success, which is what
 * idempotency means.
 *
 * `.is("used_at", null)` makes the write itself idempotent as well as
 * conditional: two simultaneous clicks cannot fight over the timestamp, and the
 * original one is never overwritten by a later one. A zero-row update on the
 * second click is success, not a miss.
 */
async function recordOptOut(admin: Admin, row: TokenRow): Promise<boolean> {
  if (row.used_at) return true;

  const { error } = await admin
    .from("email_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);

  if (error) {
    log("error", "opt_out_write_failed", { tokenId: row.id, message: error.message });
    return false;
  }
  return true;
}

/**
 * Read at most `MAX_BODY_BYTES` from the request body and decode them. The
 * bound is on what is READ, not on what is received afterwards: the reader is
 * cancelled the moment the ceiling is crossed, so an oversized or endless body
 * costs a fixed amount of memory rather than all of it.
 */
async function readBoundedText(req: Request): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        size += value.byteLength;
      }
    }
  } finally {
    // Whether we finished or hit the ceiling, stop pulling.
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined.subarray(0, MAX_BODY_BYTES));
}

/**
 * The credential, from wherever this particular caller put it. The confirmation
 * form posts to `action=""`, which preserves the query string, so a self-post
 * carries it in the form field AND in the URL. The form field is read first;
 * the query string is the fallback that also serves the GET.
 */
async function readCredential(req: Request, url: URL): Promise<string | null> {
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const raw = await readBoundedText(req);
      const field = new URLSearchParams(raw).get(UNSUBSCRIBE_QUERY_PARAM);
      if (field) return field;
    }
  }
  return url.searchParams.get(UNSUBSCRIBE_QUERY_PARAM);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { "Allow": "GET, HEAD, POST" } });
  }

  const presented = await readCredential(req, url).catch(() => null);
  const credential = isWellFormedUnsubscribeCredential(presented) ? presented : "";

  // ── GET / HEAD: ASK, WRITE NOTHING ────────────────────────────────────────
  // Every prefetcher, scanner and preview bot in the world ends here. The page
  // is identical whether the credential is real, stale or invented, so it is
  // also not an oracle, and the tag is deliberately NOT checked yet: doing so
  // would make a GET distinguish signed from unsigned for free. A malformed
  // credential renders the same form with an empty field, whose POST then takes
  // the ordinary no-match path.
  if (req.method !== "POST") {
    return htmlRes(confirmPage(credential));
  }

  // ── POST: THE ONLY PATH THAT WRITES ───────────────────────────────────────
  // A misconfigured secret cannot verify anything, and answering "you are
  // unsubscribed" without having written would be the lie this endpoint exists
  // to avoid. Fail loudly instead; it is an operator fault, not an oracle,
  // because it is the answer for EVERY input while the secret is missing.
  if (UNSUBSCRIBE_SECRETS.length === 0) {
    log("error", "unsubscribe_secret_unset", { reason: "UNSUBSCRIBE_TOKEN_SECRET missing or too short" });
    return htmlRes(errorPage(), 500);
  }

  // THE GATE, AND IT IS BEFORE THE CLIENT. Nothing below this line runs for a
  // credential that could not have been produced with one of our secrets, so a
  // guessed string never reaches a service-role query.
  const token = await verifyUnsubscribeCredential(UNSUBSCRIBE_SECRETS, credential);
  if (!token) {
    // Malformed, absent or unsigned. Answer exactly as a valid credential does:
    // an attacker learns nothing, and a human who somehow got here is told the
    // truthful thing, since no address was ever going to receive anything under
    // a credential that does not exist.
    log("info", "unsubscribe_no_match", { reason: "unverified" });
    return htmlRes(donePage());
  }

  const admin = createAdminClient();

  const { row, failed } = await findTokenRow(admin, token);
  if (failed) return htmlRes(errorPage(), 500);

  if (!row) {
    log("info", "unsubscribe_no_match", { reason: "unknown-token" });
    return htmlRes(donePage());
  }

  const ok = await recordOptOut(admin, row);
  if (!ok) return htmlRes(errorPage(), 500);

  log("info", "unsubscribed", { tokenId: row.id, repeat: row.used_at !== null });
  return htmlRes(donePage());
});
