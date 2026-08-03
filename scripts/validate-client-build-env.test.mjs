import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_SUPABASE_URL,
  validateClientBuildEnvironment,
} from "./validate-client-build-env.mjs";

const validEnvironment = () => ({
  VITE_SUPABASE_PROJECT_ID: PRODUCTION_SUPABASE_REF,
  VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_release_test_key_1234567890",
});

test("accepts the exact production endpoint with a modern publishable key", () => {
  assert.deepEqual(validateClientBuildEnvironment(validEnvironment()), {
    projectRef: PRODUCTION_SUPABASE_REF,
    keyFamily: "modern publishable",
  });
});

test("accepts one harmless trailing slash", () => {
  const environment = validEnvironment();
  environment.VITE_SUPABASE_URL += "/";
  assert.doesNotThrow(() => validateClientBuildEnvironment(environment));
});

for (const [label, mutate] of [
  ["missing URL", (environment) => delete environment.VITE_SUPABASE_URL],
  ["retired URL", (environment) => {
    environment.VITE_SUPABASE_URL = "https://yblyccthpqduyajgynsq.supabase.co";
  }],
  ["URL path", (environment) => {
    environment.VITE_SUPABASE_URL = `${PRODUCTION_SUPABASE_URL}/rest/v1`;
  }],
  ["wrong project id", (environment) => {
    environment.VITE_SUPABASE_PROJECT_ID = "yblyccthpqduyajgynsq";
  }],
  ["missing key", (environment) => {
    delete environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  }],
  ["legacy JWT key", (environment) => {
    environment.VITE_SUPABASE_PUBLISHABLE_KEY =
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature";
  }],
  ["literal newline suffix", (environment) => {
    environment.VITE_SUPABASE_PUBLISHABLE_KEY += "\\n";
  }],
  ["development bypass", (environment) => {
    environment.VITE_DEV_ADMIN_BYPASS = "true";
  }],
]) {
  test(`rejects ${label}`, () => {
    const environment = validEnvironment();
    mutate(environment);
    assert.throws(() => validateClientBuildEnvironment(environment));
  });
}

test("a rejection never echoes credential material", () => {
  const environment = validEnvironment();
  const secretLikeValue = "not-a-valid-client-credential-value";
  environment.VITE_SUPABASE_PUBLISHABLE_KEY = secretLikeValue;
  assert.throws(
    () => validateClientBuildEnvironment(environment),
    (error) => error instanceof Error && !error.message.includes(secretLikeValue),
  );
});
