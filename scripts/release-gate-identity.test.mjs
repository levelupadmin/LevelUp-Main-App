import assert from "node:assert/strict";
import test from "node:test";

import { selectIdentityMarker } from "./release-gate-identity.mjs";

const subject = "fix(identity): gate intake provisioning per offering";
const entry = (commit, message = subject) => `${commit}\t${message}`;

test("prefers the unique first-parent marker", () => {
  assert.deepEqual(
    selectIdentityMarker({
      firstParentHistory: entry("first"),
      ancestryHistory: `${entry("first")}\n${entry("side")}`,
      subject,
    }),
    { commit: "first", source: "first-parent" },
  );
});

test("accepts one exact marker from merged HEAD ancestry", () => {
  assert.deepEqual(
    selectIdentityMarker({
      firstParentHistory: entry("main", "Merge pull request"),
      ancestryHistory: `${entry("main", "Merge pull request")}\n${entry("side")}`,
      subject,
    }),
    { commit: "side", source: "ancestry" },
  );
});

test("rejects a missing marker", () => {
  assert.throws(
    () =>
      selectIdentityMarker({
        firstParentHistory: entry("main", "unrelated"),
        ancestryHistory: entry("side", "also unrelated"),
        subject,
      }),
    /contains no exact identity marker/,
  );
});

test("rejects ambiguous fallback ancestry", () => {
  assert.throws(
    () =>
      selectIdentityMarker({
        firstParentHistory: entry("main", "unrelated"),
        ancestryHistory: `${entry("side-a")}\n${entry("side-b")}`,
        subject,
      }),
    /contains 2 exact identity markers/,
  );
});

test("rejects ambiguous first-parent history", () => {
  assert.throws(
    () =>
      selectIdentityMarker({
        firstParentHistory: `${entry("main-a")}\n${entry("main-b")}`,
        ancestryHistory: `${entry("main-a")}\n${entry("main-b")}`,
        subject,
      }),
    /first-parent history contains 2 exact identity markers/,
  );
});
