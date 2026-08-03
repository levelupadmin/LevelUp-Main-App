import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryState {
  table: string;
  operation: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

const writes: QueryState[] = [];
let resourceRows: Array<Record<string, unknown>> = [];
let weekRows: Array<Record<string, unknown>> = [];
const toast = vi.fn();

function query(table: string) {
  const state: QueryState = { table, operation: "select", filters: [] };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    },
    order: () => builder,
    insert: (payload: Record<string, unknown>) => {
      state.operation = "insert";
      state.payload = payload;
      writes.push(state);
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      state.operation = "update";
      state.payload = payload;
      writes.push(state);
      return builder;
    },
    delete: () => {
      state.operation = "delete";
      writes.push(state);
      return builder;
    },
    then: (
      onFulfilled: (value: { data: unknown[] | null; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const data =
        state.operation === "select"
          ? state.table === "cohort_resources"
            ? resourceRows
            : weekRows
          : null;
      return Promise.resolve({ data, error: null }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => query(table) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import CohortResourcesManager from "../CohortResourcesManager";

const batches = [{ id: "batch-a", name: "Batch A" }];

beforeEach(() => {
  writes.length = 0;
  resourceRows = [];
  weekRows = [
    {
      id: "week-a1",
      cohort_batch_id: "batch-a",
      week_number: 1,
      theme: "Light",
    },
  ];
  toast.mockReset();
});

afterEach(cleanup);

describe("CohortResourcesManager", () => {
  it("creates an offering-wide pinned resource with the signed-in admin as author", async () => {
    render(<CohortResourcesManager offeringId="off-1" batches={batches} />);
    await screen.findByText("No resources yet.");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Cohort handbook" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/handbook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add resource" }));

    await waitFor(() =>
      expect(writes.some((write) => write.operation === "insert")).toBe(true),
    );
    expect(
      writes.find((write) => write.operation === "insert")?.payload,
    ).toEqual({
      offering_id: "off-1",
      batch_id: null,
      cohort_week_id: null,
      title: "Cohort handbook",
      kind: "link",
      url: "https://example.com/handbook",
      sort_order: 0,
      added_by: "admin-1",
    });
  });

  it("requires a second click before deleting a resource", async () => {
    resourceRows = [
      {
        id: "resource-1",
        offering_id: "off-1",
        batch_id: null,
        cohort_week_id: null,
        title: "Start here",
        kind: "link",
        url: "https://example.com/start",
        sort_order: 0,
        created_at: "2026-08-03T10:00:00Z",
      },
    ];
    render(<CohortResourcesManager offeringId="off-1" batches={batches} />);
    await screen.findByText("Start here");

    fireEvent.click(screen.getByRole("button", { name: "Remove Start here" }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        writes.find((write) => write.operation === "delete"),
      ).toBeDefined(),
    );
    expect(
      writes.find((write) => write.operation === "delete")?.filters,
    ).toContainEqual(["id", "resource-1"]);
  });
});
