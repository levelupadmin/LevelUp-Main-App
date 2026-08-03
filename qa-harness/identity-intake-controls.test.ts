import {
  normalizeApplicantEmail,
  resolveWebhookIdentity,
  selectOfferingForSignedResponse,
  signedResponseTimestamp,
  webhookIntakeGateInstalled,
  webhookProvisioningConfigured,
} from "../supabase/functions/tally-application-webhook/index.ts";
import {
  intakeGateInstalled,
  normalizePolledApplicantEmail,
  pollerProvisioningConfigured,
  resolvePolledIdentity,
} from "../supabase/functions/tally-application-poll/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const SHARED_FORM = "81dRPA";

Deno.test("shared form routes a signed Edition 2 response to the newest matching intake", () => {
  const oldEdition = {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Creator Academy Edition 1",
    payment_mode: "staged",
    tally_form_url: `https://tally.so/r/${SHARED_FORM}`,
    intake_opens_at: "2026-06-01T00:00:00.000Z",
    application_deadline: null,
    created_at: "2026-05-01T00:00:00.000Z",
    identity_spine_enabled: false,
  };
  const edition2 = {
    id: "00000000-0000-0000-0000-000000000002",
    title: "Creator Academy Edition 2",
    payment_mode: "staged",
    tally_form_url: `https://tally.so/forms/${SHARED_FORM}`,
    intake_opens_at: "2026-08-01T00:00:00.000Z",
    application_deadline: "2026-08-31",
    created_at: "2026-07-20T00:00:00.000Z",
    identity_spine_enabled: true,
  };

  // Deliberately pass the stale edition first. Selection must not depend on
  // database/mock row order when both windows overlap.
  const selected = selectOfferingForSignedResponse(
    [oldEdition, edition2],
    SHARED_FORM,
    "2026-08-03T08:30:00.000Z",
  );
  assertEquals(selected?.id, edition2.id, "the live Edition 2 window must win");

  const retriedOldResponse = selectOfferingForSignedResponse(
    [edition2, oldEdition],
    SHARED_FORM,
    "2026-07-15T08:30:00.000Z",
  );
  assertEquals(
    retriedOldResponse?.id,
    oldEdition.id,
    "an old response retried after E2 opens must remain with its original intake",
  );

  const delayedPayload = {
    // Delivery happens after E2 opened, but the signed response is from E1.
    createdAt: "2026-08-03T08:30:00.000Z",
    data: { createdAt: "2026-07-15T08:30:00.000Z" },
  };
  assertEquals(
    signedResponseTimestamp(delayedPayload),
    delayedPayload.data.createdAt,
    "routing must use response creation, never delayed delivery time",
  );
});

Deno.test("shared-form selection applies created_at and id as total tie-breakers", () => {
  const base = {
    title: "Tied intake",
    payment_mode: "staged",
    tally_form_url: `https://tally.so/r/${SHARED_FORM}`,
    intake_opens_at: "2026-08-01T00:00:00.000Z",
    application_deadline: null,
    identity_spine_enabled: true,
  };
  const selected = selectOfferingForSignedResponse(
    [
      { ...base, id: "a", created_at: "2026-07-20T00:00:00.000Z" },
      { ...base, id: "b", created_at: "2026-07-21T00:00:00.000Z" },
      { ...base, id: "c", created_at: "2026-07-21T00:00:00.000Z" },
    ],
    SHARED_FORM,
    "2026-08-03T08:30:00.000Z",
  );
  assertEquals(selected?.id, "c", "newest created_at then descending id must win");
});

Deno.test("shared-form routing fails closed for missing, unreadable, or out-of-window time", () => {
  const offering = {
    id: "offering-e2",
    title: "Creator Academy Edition 2",
    payment_mode: "staged",
    tally_form_url: `https://tally.so/r/${SHARED_FORM}`,
    intake_opens_at: "2026-08-01T00:00:00.000Z",
    application_deadline: "2026-08-31",
    created_at: "2026-07-20T00:00:00.000Z",
    identity_spine_enabled: true,
  };
  assertEquals(
    selectOfferingForSignedResponse([offering], SHARED_FORM, undefined),
    null,
    "missing signed response time must select nothing",
  );
  assertEquals(
    selectOfferingForSignedResponse([offering], SHARED_FORM, "not-a-date"),
    null,
    "unreadable signed response time must select nothing",
  );
  assertEquals(
    selectOfferingForSignedResponse([offering], SHARED_FORM, "2026-07-31T23:59:59.999Z"),
    null,
    "a response before Edition 2 opens must select nothing",
  );
});

Deno.test("per-offering identity switches default off and require literal true", () => {
  for (const disabled of [undefined, null, false, "true", 1]) {
    assertEquals(
      webhookProvisioningConfigured(disabled),
      false,
      "webhook offering switch must fail closed",
    );
    assertEquals(
      pollerProvisioningConfigured(true, disabled),
      false,
      "poller offering switch must fail closed",
    );
  }
  assert(webhookProvisioningConfigured(true), "webhook literal true should opt in");
  assert(pollerProvisioningConfigured(true, true), "poller needs both explicit switches");
  assertEquals(
    pollerProvisioningConfigured(false, true),
    false,
    "poller global switch must remain mandatory",
  );
});

Deno.test("a missing or failing hardening probe disables both intake hosts", async () => {
  const missingProbe = {
    rpc: () => Promise.resolve({
      data: null,
      error: { code: "PGRST202", message: "function unavailable" },
    }),
  };
  assertEquals(
    await webhookIntakeGateInstalled(missingProbe as never),
    false,
    "webhook must fail closed when the probe is absent",
  );
  assertEquals(
    await intakeGateInstalled(missingProbe as never),
    false,
    "poller must fail closed when the probe is absent",
  );
});

Deno.test("disabled intake preserves legacy email linking and never calls createUser", async () => {
  let webhookCreates = 0;
  let pollerCreates = 0;
  const webhook = await resolveWebhookIdentity(false, "legacy-user", async () => {
    webhookCreates += 1;
    return { userId: "new-user", pendingClaim: false, status: "created" };
  });
  const poller = await resolvePolledIdentity(false, "legacy-user", async () => {
    pollerCreates += 1;
    return { userId: "new-user", pendingClaim: false, status: "created" };
  });

  assertEquals(webhook.userId, "legacy-user", "webhook must retain the legacy link");
  assertEquals(poller.userId, "legacy-user", "poller must retain the legacy link");
  assertEquals(webhookCreates, 0, "webhook createUser path must be unreachable while off");
  assertEquals(pollerCreates, 0, "poller createUser path must be unreachable while off");
  assertEquals(
    normalizeApplicantEmail("  Applicant@Example.COM "),
    "applicant@example.com",
    "webhook legacy lookup key must be normalized",
  );
  assertEquals(
    normalizePolledApplicantEmail("  Applicant@Example.COM "),
    "applicant@example.com",
    "poller legacy lookup key must be normalized",
  );
});
