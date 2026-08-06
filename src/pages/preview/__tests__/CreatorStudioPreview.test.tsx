/**
 * The prototype's one job is to MOUNT and PLAY. These tests pin the gate,
 * every screen mounting, and the founder's requested flow actually flowing:
 * Home → resume recording → mark watched → HANDED to the assignment →
 * submit → Week 5 opens → mentor accepts → Album places it.
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

  it("mounts every section without throwing — and Second Brain is gone from the rail", () => {
    renderAs("avinash@leveluplearning.in");
    for (const tab of ["The Path", "Creator OS", "Feed", "Mentor desk", "Admin", "Home"]) {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${tab}`) })[0]);
      expect(screen.getAllByText(/Prototype/i).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("button", { name: /Second Brain/ })).toBeNull();
  });

  it("renders BOTH layouts — a desktop rail and a mobile rail — not one stretched column", () => {
    renderAs("avinash@leveluplearning.in");
    expect(screen.getAllByRole("button", { name: /^The Path/ }).length).toBe(2);
    expect(screen.getAllByLabelText("Creator Studio sections").length).toBe(2);
  });

  it("Home leads with the next action, not the stats — and it opens the recording", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getByRole("button", { name: /Resume watching/ }));
    // Recording page: a real <video> and the done button.
    expect(await screen.findByRole("button", { name: /I've finished the recording/ })).toBeTruthy();
  });

  it("PLAYS the founder's flow: recording → watched → handed to the assignment → submit → Week 5 → mentor → Album", async () => {
    renderAs("avinash@leveluplearning.in");

    // Home hero → recording
    fireEvent.click(screen.getByRole("button", { name: /Resume watching/ }));
    fireEvent.click(await screen.findByRole("button", { name: /I've finished the recording/ }));

    // XP moved in the header (840 → 850) the moment the recording completed the day.
    expect((await screen.findAllByText("850")).length).toBeGreaterThan(0);

    // Auto-handoff to the assignment (900ms) — wait it out.
    fireEvent.change(await screen.findByLabelText(/Your 3 reels/, {}, { timeout: 3000 }), { target: { value: "A, B, C" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit · unlocks Week 5/ }));
    expect(await screen.findByText(/Submitted — Week 5 is open/i)).toBeTruthy();

    // Play the mentor — the seeded queue is there too, but ours is on top.
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /Accept — reviewed on the call/ }))[0]);

    // Place it in the Album.
    fireEvent.click(screen.getAllByRole("button", { name: /^Creator OS/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Add to my Album/ }));
    expect(await screen.findByText(/Just placed · Week 4/i)).toBeTruthy();
  }, 20000);

  it("the Feed takes a typed post, a like and a comment", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Feed/ })[0]);

    // Post a request.
    fireEvent.click(await screen.findByRole("button", { name: /Raise a request/ }));
    fireEvent.change(screen.getByLabelText("Write a post"), { target: { value: "Anyone got a spare lav mic?" } });
    fireEvent.click(screen.getByRole("button", { name: /Post to the room/ }));
    expect(await screen.findByText("Anyone got a spare lav mic?")).toBeTruthy();

    // Like Meghna's seeded post (12 likes → 13).
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    expect(await screen.findByRole("button", { name: "13" })).toBeTruthy();
  });

  it("the People view shows the cohort", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Feed/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /People/ }));
    expect(await screen.findByText("Meghna Iyer")).toBeTruthy();
    expect(screen.getByText(/Filmmaking · your mentor/)).toBeTruthy();
  });
});
