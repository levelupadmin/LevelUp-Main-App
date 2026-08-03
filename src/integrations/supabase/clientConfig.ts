const DEFAULT_SUPABASE_URL = "https://ivkvluezuiojovpotlyb.supabase.co";

const RETIRED_PROJECT_REFS = [
  "yblyccthpqduyajgynsq",
  "twqagwleffjggoemzfqs",
  "xatwapycgoljbwzkhxtv",
] as const;

type SupabaseClientEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabaseClientConfig = {
  url: string;
  publishableKey: string;
};

const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

const isModernPublishableKey = (key: string): boolean =>
  /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);

const isLocalDevelopmentKey = (key: string): boolean =>
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);

/**
 * Resolve the browser-safe Supabase configuration once for every client path.
 *
 * Cloud builds must use Supabase's modern `sb_publishable_…` credential. The
 * old long-lived anon JWT format remains accepted only for a loopback Supabase
 * CLI instance, whose generated local keys are unrelated to production.
 */
export function resolveSupabaseClientConfig(
  environment: SupabaseClientEnvironment,
): SupabaseClientConfig {
  const rawUrl = environment.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(
      "Invalid Supabase client configuration: VITE_SUPABASE_URL must be a valid URL.",
    );
  }

  const isLoopback = isLoopbackHost(parsedUrl.hostname);
  if (
    parsedUrl.protocol !== "https:" &&
    !(parsedUrl.protocol === "http:" && isLoopback)
  ) {
    throw new Error(
      "Invalid Supabase client configuration: cloud VITE_SUPABASE_URL must use HTTPS.",
    );
  }

  if (RETIRED_PROJECT_REFS.some((ref) => parsedUrl.hostname.includes(ref))) {
    throw new Error(
      "Invalid Supabase client configuration: VITE_SUPABASE_URL points to a retired project.",
    );
  }

  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    throw new Error(
      "Missing Supabase client configuration: VITE_SUPABASE_PUBLISHABLE_KEY is required.",
    );
  }

  if (
    !isModernPublishableKey(publishableKey) &&
    !(isLoopback && isLocalDevelopmentKey(publishableKey))
  ) {
    throw new Error(
      "Invalid Supabase client configuration: VITE_SUPABASE_PUBLISHABLE_KEY must be a modern sb_publishable_ key for cloud builds.",
    );
  }

  return {
    url: parsedUrl.origin,
    publishableKey,
  };
}
