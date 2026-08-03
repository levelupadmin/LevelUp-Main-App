import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectedWorkerAuthToken,
  workerAuthMatches,
} from "../../../supabase/functions/process-email-queue/auth";

const root = (path: string) => resolve(process.cwd(), path);

describe("email worker cron authentication", () => {
  it("uses the Vault-synchronized token before the injected service-key fallback", () => {
    expect(expectedWorkerAuthToken("vault-jwt", "sb_secret_runtime")).toBe("vault-jwt");
    expect(workerAuthMatches("vault-jwt", "vault-jwt", "sb_secret_runtime")).toBe(true);
    expect(workerAuthMatches("sb_secret_runtime", "vault-jwt", "sb_secret_runtime")).toBe(false);
  });

  it("falls back to the injected key only when the explicit token is empty", () => {
    expect(expectedWorkerAuthToken("", "service-key")).toBe("service-key");
    expect(workerAuthMatches("service-key", "", "service-key")).toBe(true);
    expect(workerAuthMatches("forged", "", "service-key")).toBe(false);
    expect(workerAuthMatches("", "", "")).toBe(false);
  });

  it("keeps the cron caller wired to the Vault credential", () => {
    const schedule = readFileSync(root("ops/backend/restore-email-queue-cron.sql"), "utf8");

    expect(schedule).toContain("name = 'email_queue_service_role_key'");
    expect(schedule).toContain("'Authorization', 'Bearer ' ||");
  });
});
