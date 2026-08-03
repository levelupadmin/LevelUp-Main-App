function duplicates(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function sameOrder(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Prove that production contains an ordered prefix of the release migration
 * train and that the linked dry-run contains exactly the remaining suffix.
 *
 * Unrelated historical migrations are deliberately ignored: this gate owns
 * the integrated cohort release train, not every migration the project has
 * ever applied. Unexpected pending migrations are never ignored because
 * `db push` would apply them in the same cutover.
 */
export function validateProductionMigrationPlan({
  expectedVersions,
  historyRows,
  pendingVersions,
}) {
  const expected = expectedVersions.map(String);
  const pending = pendingVersions.map(String);
  const expectedDuplicates = duplicates(expected);
  if (expected.length === 0 || expectedDuplicates.length > 0) {
    throw new Error(
      `release migration configuration is invalid; expectedCount=${expected.length} duplicates=[${expectedDuplicates.join(", ")}].`,
    );
  }

  const expectedSet = new Set(expected);
  const releaseRows = historyRows.filter((row) =>
    expectedSet.has(String(row?.remote || "")),
  );
  const applied = releaseRows.map((row) => String(row.remote));
  const appliedDuplicates = duplicates(applied);
  const pendingDuplicates = duplicates(pending);
  const foreignPending = pending.filter((version) => !expectedSet.has(version));
  const localMismatches = releaseRows
    .filter((row) => String(row?.local || "") !== String(row?.remote || ""))
    .map((row) => `${row?.local || "missing"}->${row?.remote || "missing"}`);

  const expectedAppliedPrefix = expected.slice(0, applied.length);
  const expectedPendingSuffix = expected.slice(applied.length);
  const appliedMatches = sameOrder(applied, expectedAppliedPrefix);
  const pendingMatches = sameOrder(pending, expectedPendingSuffix);

  if (
    !appliedMatches ||
    !pendingMatches ||
    appliedDuplicates.length > 0 ||
    pendingDuplicates.length > 0 ||
    foreignPending.length > 0 ||
    localMismatches.length > 0
  ) {
    throw new Error(
      "production migration state is not an applied prefix plus pending suffix; " +
        `applied=[${applied.join(", ")}] ` +
        `expectedAppliedPrefix=[${expectedAppliedPrefix.join(", ")}] ` +
        `pending=[${pending.join(", ")}] ` +
        `expectedPendingSuffix=[${expectedPendingSuffix.join(", ")}] ` +
        `appliedDuplicates=[${appliedDuplicates.join(", ")}] ` +
        `pendingDuplicates=[${pendingDuplicates.join(", ")}] ` +
        `foreignPending=[${foreignPending.join(", ")}] ` +
        `localMismatches=[${localMismatches.join(", ")}].`,
    );
  }

  return {
    appliedVersions: applied,
    pendingVersions: pending,
  };
}
