import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Duplicate on the Offerings list: opens a dialog pre-filled with "<title>
 *  (copy)", calls the admin_duplicate_offering RPC with the typed title and
 *  the curriculum toggle, then opens the copy in the editor. */

const { rpc, navigate, toast } = vi.hoisted(() => ({ rpc: vi.fn(), navigate: vi.fn(), toast: vi.fn() }));

function query(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain, order: chain, in: chain, eq: chain, update: chain, delete: chain,
    then: (ok: (v: { data: unknown; error: null }) => unknown) => {
      const data =
        table === "offerings"
          ? [{ id: "off-1", title: "BFP — Batch 23", slug: "bfp-23", type: "onetime", price_inr: 0, mrp_inr: null, status: "active", is_public: false }]
          : table === "offering_courses" ? [{ offering_id: "off-1", course_id: "c-1" }]
          : [];
      return Promise.resolve({ data, error: null }).then(ok);
    },
  });
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t), rpc } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import AdminOfferings from "../AdminOfferings";

beforeEach(() => { rpc.mockReset(); navigate.mockReset(); toast.mockReset(); });
afterEach(cleanup);

describe("AdminOfferings — duplicate", () => {
  it("calls admin_duplicate_offering with the new title + curriculum flag and opens the copy", async () => {
    rpc.mockResolvedValue({ data: "off-new", error: null });
    render(<AdminOfferings />);
    await screen.findByText("BFP — Batch 23");

    fireEvent.click(screen.getByTitle("Duplicate offering (new batch)"));
    const title = await screen.findByDisplayValue("BFP — Batch 23 (copy)");
    fireEvent.change(title, { target: { value: "BFP — Batch 24" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("admin_duplicate_offering", {
      p_offering_id: "off-1", p_new_title: "BFP — Batch 24", p_copy_curriculum: true,
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/offerings/off-new/edit"));
  });

  it("surfaces a server error instead of navigating", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Admins only" } });
    render(<AdminOfferings />);
    await screen.findByText("BFP — Batch 23");
    fireEvent.click(screen.getByTitle("Duplicate offering (new batch)"));
    await screen.findByDisplayValue("BFP — Batch 23 (copy)");
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't duplicate", description: "Admins only" });
    expect(navigate).not.toHaveBeenCalled();
  });
});
