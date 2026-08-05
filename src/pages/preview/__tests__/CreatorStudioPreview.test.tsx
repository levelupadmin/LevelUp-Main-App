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
  mockAuth.mockReturnValue({ user: email ? { email } : null, profile: null });
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

  it("mounts every tab without throwing", () => {
    renderAs("avinash@leveluplearning.in");
    for (const tab of ["Path", "Feed", "Album", "Mentor", "Admin", "Home"]) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      expect(screen.getByText(/Prototype — nothing here is live/i)).toBeTruthy();
    }
  });

  it("shows the real 13-block engine on the path, not placeholder weeks", () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getByRole("button", { name: "Path" }));
    expect(screen.getByText(/The Psychology of Storytelling/i)).toBeTruthy();
    expect(screen.getByText(/The Creator OS \+ Your 12-Month Plan \+ Demo Day/i)).toBeTruthy();
  });
});
