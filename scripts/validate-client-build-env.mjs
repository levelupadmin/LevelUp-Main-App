#!/usr/bin/env node
/* global console, process, URL */

import { pathToFileURL } from "node:url";

export const PRODUCTION_SUPABASE_REF = "ivkvluezuiojovpotlyb";
export const PRODUCTION_SUPABASE_URL =
  `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

const MODERN_PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;

/**
 * Fail before Vite compiles a browser bundle that cannot boot.
 *
 * Vite does not reject an absent VITE_* value: it can emit a successful build
 * whose first import throws in the browser. This preflight owns the production
 * endpoint/key invariants and deliberately never includes credential material
 * in an error or success message.
 */
export function validateClientBuildEnvironment(environment) {
  const rawUrl = environment.VITE_SUPABASE_URL?.trim();
  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl || "invalid:");
  } catch {
    throw new Error(
      "VITE_SUPABASE_URL must name the LevelUp production Supabase endpoint.",
    );
  }

  if (
    parsedUrl.origin !== PRODUCTION_SUPABASE_URL ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "VITE_SUPABASE_URL must name the LevelUp production Supabase endpoint.",
    );
  }

  if (
    environment.VITE_SUPABASE_PROJECT_ID?.trim() !== PRODUCTION_SUPABASE_REF
  ) {
    throw new Error(
      "VITE_SUPABASE_PROJECT_ID must name the LevelUp production project.",
    );
  }

  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!MODERN_PUBLISHABLE_KEY.test(publishableKey)) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be a modern sb_publishable_ key.",
    );
  }

  if (environment.VITE_DEV_ADMIN_BYPASS?.trim().toLowerCase() === "true") {
    throw new Error("VITE_DEV_ADMIN_BYPASS must not be enabled in a production build.");
  }

  return {
    projectRef: PRODUCTION_SUPABASE_REF,
    keyFamily: "modern publishable",
  };
}

function main() {
  const result = validateClientBuildEnvironment(process.env);
  console.log(
    `PASS  client build environment (${result.projectRef}; ${result.keyFamily} key)`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Client build environment rejected: ${message}`);
    process.exitCode = 1;
  }
}
