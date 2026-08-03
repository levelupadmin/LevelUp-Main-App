import { timingSafeEqual } from "../_shared/crypto.ts";

/** Resolve the credential pg_cron must present. Vault may still hold the
 * legacy service-role JWT while the runtime injects an sb_secret_* key, so the
 * explicitly synchronized token wins whenever it is non-empty. */
export function expectedWorkerAuthToken(
  explicitToken: string | null | undefined,
  serviceRoleKey: string,
): string {
  return explicitToken || serviceRoleKey;
}

export function workerAuthMatches(
  presentedToken: string,
  explicitToken: string | null | undefined,
  serviceRoleKey: string,
): boolean {
  const expected = expectedWorkerAuthToken(explicitToken, serviceRoleKey);
  return presentedToken.length > 0 && expected.length > 0 && timingSafeEqual(presentedToken, expected);
}
