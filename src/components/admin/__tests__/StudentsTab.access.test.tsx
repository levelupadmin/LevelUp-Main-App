import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Revoke / Restore on the offering editor's Students tab.
 *
 * Access is decided purely by enrolments.status = 'active' (RLS +
 * has_offering_access), so the contract under test is the exact UPDATE payload:
 * revoke flips to 'revoked' with who/when/why and NEVER deletes; restore flips
 * back and clears the revoke columns. Both write an admin_audit_logs row.
 */

interface Write { table: string; operation: string; payload?: Record<string, unknown>; filters: Array<[string, unknown]> }
const writes: Write[] = [];
let enrolmentRows: Array<Record<string, unknown>> = [];

function query(table: string) {
  const state: Write = { table, operation: "select", filters: [] };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: (c: string, v: unknown) => { state.filters.push([c, v]); return builder; },
    in: chain, or: chain, order: chain, limit: chain, ilike: chain,
    update: (payload: Record<string, unknown>) => { state.operation = "update"; state.payload = payload; writes.push(state); return builder; },
    insert: (payload: Record<string, unknown>) => { state.operation = "insert"; state.payload = payload; writes.push(state); return builder; },
    then: (ok: (v: { data: unknown; error: null }) => unknown, ko?: (e: unknown) => unknown) => {
      const data = state.operation === "select" && table === "enrolments_unified" ? enrolmentRows : null;
      return Promise.resolve({ data, error: null }).then(ok, ko);
    },
  });
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => query(t), functions: { invoke: vi.fn() } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { id: "admin-1" } }) }));
const { toast, navigate } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() }, navigate: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

import StudentsTab from "../offering-editor/StudentsTab";

const row = (over: Record<string, unknown>) => ({
  id: "enr-1", user_id: "u-1", status: "active", source: "bulk_import",
  created_at: "2026-08-19T00:00:00Z", expires_at: null, total_paid_inr: null,
  user_email: "asha@example.com", user_phone: "+919876543210", user_full_name: "Asha Rao",
  ...over,
});

beforeEach(() => { writes.length = 0; toast.success.mockReset(); toast.error.mockReset(); });
afterEach(cleanup);

describe("StudentsTab — revoke / restore access", () => {
  it("revokes with a reason: status→revoked, stamps who/when/why, audit-logs, never deletes", async () => {
    enrolmentRows = [row({})];
    render(<StudentsTab offeringId="off-1" />);
    await screen.findByText("Asha Rao");

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await screen.findByText(/Revoke access for Asha Rao\?/);
    fireEvent.change(screen.getByPlaceholderText(/Refunded on/), { target: { value: "Refunded 5 Sep" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() => expect(writes.some((w) => w.operation === "update")).toBe(true));
    const upd = writes.find((w) => w.operation === "update")!;
    expect(upd.table).toBe("enrolments");
    expect(upd.filters).toEqual([["id", "enr-1"]]);
    expect(upd.payload).toMatchObject({ status: "revoked", revoked_by: "admin-1", revoked_reason: "Refunded 5 Sep" });
    expect(typeof upd.payload!.revoked_at).toBe("string");
    expect(writes.some((w) => w.operation === "delete")).toBe(false);

    await waitFor(() => expect(writes.some((w) => w.table === "admin_audit_logs")).toBe(true));
    expect(writes.find((w) => w.table === "admin_audit_logs")!.payload).toMatchObject({
      actor_user_id: "admin-1", action: "enrolment.revoked", target_id: "enr-1",
      metadata: { offering_id: "off-1", user_id: "u-1", reason: "Refunded 5 Sep" },
    });
    expect(toast.success).toHaveBeenCalledWith("Asha Rao: access revoked");
  });

  it("restores a revoked row: status→active and the revoke columns are cleared", async () => {
    enrolmentRows = [row({ status: "revoked" })];
    render(<StudentsTab offeringId="off-1" />);
    await screen.findByText("Asha Rao");
    expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    await waitFor(() => expect(writes.some((w) => w.operation === "update")).toBe(true));
    expect(writes.find((w) => w.operation === "update")!.payload).toEqual({
      status: "active", revoked_at: null, revoked_by: null, revoked_reason: null,
    });
    await waitFor(() => expect(writes.some((w) => w.table === "admin_audit_logs")).toBe(true));
    expect(writes.find((w) => w.table === "admin_audit_logs")!.payload).toMatchObject({ action: "enrolment.restored", target_id: "enr-1" });
  });

  it("clicking Revoke does not also open the student in Users (row navigation is suppressed)", async () => {
    enrolmentRows = [row({})];
    render(<StudentsTab offeringId="off-1" />);
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
