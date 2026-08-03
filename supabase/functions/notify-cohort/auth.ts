import { timingSafeEqual } from "../_shared/crypto.ts";

/**
 * Authenticate the private pg_cron caller with its dedicated opaque token.
 *
 * This deliberately has no service-role fallback. The service-role key grants
 * database authority and must not double as a callable-function credential.
 */
export function notifyCohortAuthMatches(
  authorization: string | null | undefined,
  expectedToken: string | null | undefined,
): boolean {
  const expected = expectedToken ?? "";
  if (!expected || !authorization?.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  const presented = authorization.slice("Bearer ".length).trim();
  return presented.length > 0 && timingSafeEqual(presented, expected);
}
