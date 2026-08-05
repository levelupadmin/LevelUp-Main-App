/**
 * The prototype's one job is to MOUNT on a real device. These tests prove the
 * gate closes for everyone else and that every screen renders without throwing
 * — the failure mode that would waste a review session.
 */
import { describe, it, expect, vi } from "vitest";
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

describe("CreatorStudioPreview", () => {
  it("renders nothing of the prototype for a non-allowlisted user", () => {
    renderAs("student@gmail.com");
    expect(screen.queryByText(/Prototype — nothing here is live/i)).toBeNull();
  });

  it("renders for the allowlisted address, banner first", () => {
    renderAs("avinash@leveluplearning.in");
    expect(screen.getByText(/Prototype — nothing here is live/i)).toBeTruthy();
    expect(screen.getByText(/Creator Academy · Edition 2/i)).toBeTruthy();
  });

  it("mounts every section without throwing", () => {
    renderAs("avinash@leveluplearning.in");
    for (const tab of ["The Path", "Second Brain", "Creator OS", "Feed", "Mentor desk", "Admin", "Home"]) {
      // Both rails render, so the label appears twice — either will do.
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${tab}`) })[0]);
      expect(screen.getAllByText(/Prototype/i).length).toBeGreaterThan(0);
    }
  });

  it("shows the real 13-block engine on the path, not placeholder weeks", () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    expect(screen.getAllByText(/Advanced Production/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/The Creator OS \+ Your 12-Month Plan/i)).toBeTruthy();
    expect(screen.getByText(/Distribution Engine/i)).toBeTruthy();
  });

  it("renders BOTH layouts — a desktop rail and a mobile rail — not one stretched column", () => {
    renderAs("avinash@leveluplearning.in");
    // The regression this pins: v1 had a single max-w-lg column, so each section
    // label existed exactly once. Two rails means two, and that is the fix.
    expect(screen.getAllByRole("button", { name: /^The Path/ }).length).toBe(2);
    expect(screen.getAllByLabelText("Creator Studio sections").length).toBe(2);
  });
});
