import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Add student: the country is its own dropdown (India by default) and the
 * number goes beside it (founder, 2 Nov 2026). The contract under test is what
 * reaches admin-grant-access: the full number with its "+", which the function
 * reads as-is, so a UK student can never become a +91 account.
 */

function query() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain, eq: chain, in: chain, or: chain, order: chain, limit: chain, ilike: chain,
    then: (ok: (v: { data: unknown; error: null }) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok, ko),
  });
  return builder;
}

const { invoke, toast } = vi.hoisted(() => ({ invoke: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query(), functions: { invoke } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { id: "admin-1" } }) }));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import StudentsTab from "../offering-editor/StudentsTab";
import { countryOf, phoneProblem, toE164, typedNumber } from "../AdminPhoneInput";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { counts: {}, results: [{ status: "created_and_enrolled", input: {} }] }, error: null });
  toast.success.mockReset(); toast.error.mockReset();
});
afterEach(cleanup);

async function openAdd() {
  render(<StudentsTab offeringId="off-1" />);
  fireEvent.click(await screen.findByRole("button", { name: /add student/i }));
  await screen.findByText("Add a student to this product");
}
const numberBox = () => screen.getByPlaceholderText("Mobile number") as HTMLInputElement;
const countryBox = () => screen.getByRole("combobox", { name: /phone number country/i }) as HTMLSelectElement;
const createButton = () => screen.getByRole("button", { name: /create account & grant access/i });

describe("StudentsTab — Add student's phone box", () => {
  it("starts on India and sends a 10-digit number as +91", async () => {
    await openAdd();
    expect(countryBox().value).toBe("IN");
    expect(createButton()).toBeDisabled();
    fireEvent.change(numberBox(), { target: { value: "+91 98765 43210" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body.students[0].phone).toBe("+919876543210");
  });

  it("sends a UK number with +44 once the UK is picked", async () => {
    await openAdd();
    fireEvent.change(countryBox(), { target: { value: "GB" } });
    fireEvent.change(numberBox(), { target: { value: "+44 7700 900123" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body.students[0].phone).toBe("+447700900123");
  });

  it("shows no error after picking a country, before a number is typed", async () => {
    await openAdd();
    fireEvent.change(countryBox(), { target: { value: "GB" } });
    expect(screen.queryByText(/Not a valid number/)).toBeNull();
    expect(createButton()).toBeDisabled();
  });

  it("names the country and keeps the button off while the number is too short", async () => {
    await openAdd();
    fireEvent.change(countryBox(), { target: { value: "GB" } });
    fireEvent.change(numberBox(), { target: { value: "+44 7700" } });
    expect(await screen.findByText("Not a valid number for United Kingdom")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("AdminPhoneInput helpers", () => {
  it("opens stored numbers with their code, with or without the +", () => {
    expect(toE164("917550173731")).toBe("+917550173731");
    expect(toE164("+447700900123")).toBe("+447700900123");
    expect(toE164("9876543210")).toBe("+919876543210");
    expect(toE164(null)).toBe("");
  });

  it("treats a bare country code as no number, and opens a number on its own country", () => {
    expect(typedNumber("+44", "GB")).toBe("");
    expect(typedNumber("+447", "GB")).toBe("+447");
    expect(phoneProblem("+44", "GB")).toBeNull();
    expect(countryOf("+447700900123")).toBe("GB");
    expect(countryOf("+917550173731")).toBe("IN");
    expect(countryOf("")).toBe("IN");
  });

  it("is fine with an empty or full number, and names the country otherwise", () => {
    expect(phoneProblem("", "IN")).toBeNull();
    expect(phoneProblem("+919876543210", "IN")).toBeNull();
    expect(phoneProblem("+9198765", "IN")).toBe("Not a valid number for India");
  });
});
