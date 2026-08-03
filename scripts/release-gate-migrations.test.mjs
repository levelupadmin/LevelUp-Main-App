import assert from "node:assert/strict";
import test from "node:test";

import { validateProductionMigrationPlan } from "./release-gate-migrations.mjs";

const expectedVersions = [
  "20260803200000",
  "20260803201000",
  "20260803210000",
  "20260803220000",
];
const row = (version) => ({ local: version, remote: version });

test("accepts an applied prefix with exactly the remaining dry-run suffix", () => {
  assert.deepEqual(
    validateProductionMigrationPlan({
      expectedVersions,
      historyRows: [row("20260308191416"), row("20260803200000"), row("20260803201000")],
      pendingVersions: ["20260803210000", "20260803220000"],
    }),
    {
      appliedVersions: ["20260803200000", "20260803201000"],
      pendingVersions: ["20260803210000", "20260803220000"],
    },
  );
});

test("accepts the post-cutover state with no pending migrations", () => {
  assert.deepEqual(
    validateProductionMigrationPlan({
      expectedVersions,
      historyRows: expectedVersions.map(row),
      pendingVersions: [],
    }),
    {
      appliedVersions: expectedVersions,
      pendingVersions: [],
    },
  );
});

test("preserves the original all-pending release-train case", () => {
  assert.deepEqual(
    validateProductionMigrationPlan({
      expectedVersions,
      historyRows: [row("20260308191416")],
      pendingVersions: expectedVersions,
    }),
    {
      appliedVersions: [],
      pendingVersions: expectedVersions,
    },
  );
});

test("rejects an applied gap even when a later expected version is present", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [row("20260803200000"), row("20260803210000")],
        pendingVersions: ["20260803201000"],
      }),
    /applied prefix plus pending suffix/,
  );
});

test("rejects reordered applied versions", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [row("20260803201000"), row("20260803200000")],
        pendingVersions: ["20260803210000"],
      }),
    /expectedAppliedPrefix/,
  );
});

test("rejects reordered pending versions", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [row("20260803200000")],
        pendingVersions: ["20260803210000", "20260803201000"],
      }),
    /expectedPendingSuffix/,
  );
});

test("rejects a foreign migration in the linked dry-run", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [row("20260803200000"), row("20260803201000")],
        pendingVersions: ["20260803205000", "20260803210000"],
      }),
    /foreignPending=\[20260803205000\]/,
  );
});

test("rejects duplicate pending versions", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [row("20260803200000"), row("20260803201000")],
        pendingVersions: ["20260803210000", "20260803210000"],
      }),
    /pendingDuplicates=\[20260803210000\]/,
  );
});

test("rejects a production row whose local and remote versions disagree", () => {
  assert.throws(
    () =>
      validateProductionMigrationPlan({
        expectedVersions,
        historyRows: [
          row("20260803200000"),
          { local: "", remote: "20260803201000" },
        ],
        pendingVersions: ["20260803210000"],
      }),
    /localMismatches=\[missing->20260803201000\]/,
  );
});
