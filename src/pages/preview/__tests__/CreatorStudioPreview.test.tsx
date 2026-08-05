/**
 * The prototype's one job is to MOUNT and PLAY. These tests pin the gate,
 * every screen mounting, and the loop actually looping (day → XP; block →
 * Week 5; accept → Album).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import CreatorStudioPreview from "../CreatorStudioPreview";

const renderAs = (email: string | null) => {
  mockAuth.mockReturnValue({ user: email ? { id: "auth-id", email } : null, profile: null });
  return render(
    <MemoryRouter initialEntries={["/creator-studio-preview"]}>
      <CreatorStudioPreview />
    </MemoryRouter>,
  );
};

beforeEach(() => localStorage.clear());

describe("CreatorStudioPreview", () => {
  it("renders for anyone on a preview host — jsdom is localhost, where the Vercel bypass token is the door", () => {
    renderAs("student@gmail.com");
    expect(screen.getAllByText(/Prototype/i).length).toBeGreaterThan(0);
  });

  it("refuses a non-allowlisted user on the production domain", () => {
    const original = window.location;
    Object.defineProperty(window, "location", {
      value: { ...original, hostname: "app.leveluplearning.in" },
      writable: true,
    });
    try {
      renderAs("student@gmail.com");
      expect(screen.queryByText(/Prototype/i)).toBeNull();
    } finally {
      Object.defineProperty(window, "location", { value: original, writable: true });
    }
  });

  it("mounts every section without throwing", () => {
    renderAs("avinash@leveluplearning.in");
    for (const tab of ["The Path", "Second Brain", "Creator OS", "Feed", "Mentor desk", "Admin", "Home"]) {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${tab}`) })[0]);
      expect(screen.getAllByText(/Prototype/i).length).toBeGreaterThan(0);
    }
  });

  it("renders BOTH layouts — a desktop rail and a mobile rail — not one stretched column", () => {
    renderAs("avinash@leveluplearning.in");
    expect(screen.getAllByRole("button", { name: /^The Path/ }).length).toBe(2);
    expect(screen.getAllByLabelText("Creator Studio sections").length).toBe(2);
  });

  it("PLAYS: completing the starred day moves XP in the header", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    // AnimatePresence mode="wait" swaps screens through an exit frame — await it.
    fireEvent.click(await screen.findByRole("button", { name: /Wed — Write 3 hooks/ }));
    expect((await screen.findAllByText("850")).length).toBeGreaterThan(0);
  });

  it("PLAYS: submitting the block opens Week 5 and the mentor desk can accept it", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Wed — Write 3 hooks/ })); // day done → block current
    fireEvent.click(await screen.findByRole("button", { name: /Thu 9 PM — The block/ })); // opens session
    fireEvent.change(await screen.findByLabelText(/Your 3 reels/), { target: { value: "A, B, C" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit · unlocks Week 5/ }));
    expect(await screen.findByText(/Submitted — Week 5 is open/i)).toBeTruthy();
    // play the mentor
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Accept — reviewed on the call/ }));
    // place it in the Album
    fireEvent.click(screen.getAllByRole("button", { name: /^Creator OS/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Add to my Album/ }));
    expect(await screen.findByText(/10 of 19 pieces placed/i)).toBeTruthy();
  });
});
