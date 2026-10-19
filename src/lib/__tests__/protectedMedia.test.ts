import { describe, expect, it, vi, beforeEach } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { fetchSignedMediaUrl } from "../protectedMedia";

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

describe("fetchSignedMediaUrl", () => {
  // Braces matter: Vitest runs a function returned from beforeEach as cleanup,
  // and mockReset() returns the mock itself.
  beforeEach(() => {
    invoke.mockReset();
  });

  it("returns the signed url", async () => {
    invoke.mockResolvedValue({ data: { url: "https://signed.example/v.mp4" }, error: null });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "ok", url: "https://signed.example/v.mp4" });
    expect(invoke).toHaveBeenCalledWith("get-video-src", { body: { chapter_id: "c1" } });
  });

  // The dead-lesson case: never tell a student to check their enrolment.
  it("reads a 404 file_missing as missing", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, { error: "file_missing" }) });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "missing" });
  });

  it("keeps other 404s (chapter not found) as a generic error", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, { error: "Chapter not found" }) });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "error" });
  });

  it("reads 401 and 403 as denied", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, { error: "Sign in to watch this lesson." }) });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "denied" });
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: "You don't have access" }) });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "denied" });
  });

  it("reads a network failure or a thrown invoke as error", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError("offline")) });
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "error" });
    invoke.mockRejectedValue(new Error("boom"));
    expect(await fetchSignedMediaUrl("c1")).toEqual({ kind: "error" });
  });
});
