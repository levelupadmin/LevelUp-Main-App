/**
 * The prototype's one job is to MOUNT and PLAY. These tests pin the gate,
 * every screen mounting, and the founder's requested flow actually flowing:
 * Home → resume recording → mark watched → HANDED to the assignment →
 * submit → Week 5 opens → mentor accepts → Album places it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

    // Play the mentor — cohort → week 4 → Submissions tab, ours on top.
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy · Cohort 01/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 4 · Sun 3 Aug/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Submissions$/ }));
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

  it("a FUTURE week's session is readable — details open, only the doing is locked", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    // Week 9's class node exists on the trail and opens its session page.
    fireEvent.click(await screen.findByRole("button", { name: /Sun 3 PM — Live class — Community \+ Lead Capture/ }));
    // The founder's ask: info is visible even though the week hasn't happened.
    expect(await screen.findByText(/turning viewers into names you own/i)).toBeTruthy();
    expect(screen.getByText(/The capture machine: lead magnet/)).toBeTruthy();
    // The Zoom door is a placeholder, not a dead lock.
    expect(screen.getByRole("button", { name: /Zoom link drops Sun 7 Sep/ })).toBeTruthy();
  });

  it("the All-sessions overview lists every week and a tap jumps to it on the Path", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /All sessions/ }));
    // All 13 sessions listed with dates.
    expect(await screen.findByText("Sun 28 Sep · upcoming")).toBeTruthy();
    // One action, one outcome: tapping a row closes the sheet and jumps on the trail.
    fireEvent.click(screen.getByRole("button", { name: /The Creator OS \+ Your 12-Month Plan/ }));
    await waitFor(() => expect(screen.queryByText("Sun 28 Sep · upcoming")).toBeNull());
    // The session itself opens from the trail node — still one click away.
    fireEvent.click(await screen.findByRole("button", { name: /Sun 3 PM — Live class — The Creator OS/ }));
    expect(await screen.findByText(/your 12-month engine, presented on Demo Day/i)).toBeTruthy();
  });

  it("a PAST week's class node is a rewatch door, not a checkmark grave", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Sun 3 PM — Live class — Scriptwriting/ }));
    expect(await screen.findByRole("button", { name: /Rewatch the class|Watch the recording/ })).toBeTruthy();
  });

  it("ADMIN DEMO: launch a Dec 5 cohort with a blackout and see it announced", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Launch a cohort/ }));
    // Default start is Dec 5; add a blackout on Week 3's class day.
    fireEvent.change(await screen.findByLabelText(/Blackout days/), { target: { value: "2026-12-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /Generate the calendar/ }));
    // The calendar shows the shift, then announces.
    expect(await screen.findByText(/1 class shifted past blackouts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Announce Creator Academy · Cohort 03/ }));
    expect(await screen.findByText(/Announced/)).toBeTruthy();
  }, 15000);

  it("ADMIN DEMO: a Template Studio edit projects onto the student session page", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Template Studio/ }));
    // Week 6 is selected by default — rewrite the session blurb and save.
    fireEvent.change(await screen.findByLabelText(/Session blurb/), {
      target: { value: "The 20-minute edit system, rebuilt live." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save to template/ }));
    expect(await screen.findByText(/Saved — live on the student Path/)).toBeTruthy();
    // View as student → the session page shows the admin's words.
    fireEvent.click(screen.getByRole("button", { name: /View Week 6 as a student/ }));
    expect(await screen.findByText("The 20-minute edit system, rebuilt live.")).toBeTruthy();
  }, 15000);

  it("BUILDER: a program built from scratch renders its own Path", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Build a program from scratch/ }));

    // Name it, rename the phase, add a community call and a resource with a link.
    fireEvent.change(await screen.findByLabelText("Program name"), { target: { value: "Video Editing Studio" } });
    fireEvent.change(screen.getByLabelText("Phase 1 name"), { target: { value: "Orientation" } });
    fireEvent.click(screen.getByRole("button", { name: /Add to Week 1/ }));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "Thu" } });
    fireEvent.change(screen.getByLabelText("Card type"), { target: { value: "community_call" } });
    fireEvent.change(screen.getByLabelText("Card title"), { target: { value: "Community call — wins & blockers" } });
    fireEvent.click(screen.getByRole("button", { name: /Add card/ }));
    // Second card: a resource — its template opens on add; attach a Drive link there.
    fireEvent.click(screen.getByRole("button", { name: /Add to Week 1/ }));
    fireEvent.change(screen.getByLabelText("Card type"), { target: { value: "resource" } });
    fireEvent.change(screen.getByLabelText("Card title"), { target: { value: "Editing template pack" } });
    fireEvent.click(screen.getByRole("button", { name: /Add card/ }));
    fireEvent.change(await screen.findByLabelText("Resource URL"), { target: { value: "https://drive.google.com/drive/folders/xyz" } });
    fireEvent.click(screen.getByRole("button", { name: "Add resource" }));

    // Add a second phase, then preview the generated Path.
    fireEvent.click(screen.getByRole("button", { name: /Add a phase/ }));
    fireEvent.click(screen.getByRole("button", { name: /Preview the Path/ }));

    expect(await screen.findByText("Video Editing Studio")).toBeTruthy();
    expect(screen.getByText("Orientation")).toBeTruthy();
    expect(screen.getByText(/THU · COMMUNITY CALL/)).toBeTruthy();
    expect(screen.getByText("Editing template pack")).toBeTruthy();
  }, 20000);

  it("TEMPLATES: the sample program's cards open as filled student pages, and its assignment takes a submission that reaches the Mentor Desk", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Build a program from scratch/ }));
    // One tap: the fully-filled sample.
    fireEvent.click(await screen.findByRole("button", { name: /Load a filled sample/ }));
    fireEvent.click(screen.getByRole("button", { name: /Preview the Path/ }));

    // The generated Path is clickable — open the orientation live class.
    fireEvent.click(await screen.findByRole("button", { name: /Sun — Orientation — how this program works/ }));
    // The student page renders the filled template: mentor, brief, Zoom→recording, resources.
    expect(await screen.findByText(/Hosted by Rahul/)).toBeTruthy();
    expect(screen.getByText(/how reviews work/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Watch the recording/ })).toBeTruthy(); // recording present → replaces Zoom
    expect(screen.getByText("Program handbook (PDF)")).toBeTruthy();

    // Back to the Path → open the assignment → the in-built form.
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + "Video Editing Studio") }));
    fireEvent.click(await screen.findByRole("button", { name: /Sat — First cut — the 30-second sequence/ }));
    expect(await screen.findByText(/Paste the link to your exported cut/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Submission for First cut/), { target: { value: "https://youtu.be/first-cut — trimming the open hurt" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit — goes straight to the Mentor Desk/ }));
    expect(await screen.findByText(/Submitted — sitting in the Mentor Desk/)).toBeTruthy();

    // And the Mentor Desk actually has it.
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Program Builder demos/ }));
    expect(await screen.findByText(/trimming the open hurt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ship — reviewed on the call/ }));
    expect(await screen.findByText(/can now place this piece in their Creator OS/)).toBeTruthy();
  }, 25000);

  it("MENTOR v2: cohort → weeks → students tab counts + submissions tab + CSV export", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy · Cohort 01/ }));
    // Weeks grid — current week flagged.
    expect(await screen.findByText(/You're here/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Week 4 · Sun 3 Aug/ }));
    // Students tab first: counts + statuses.
    expect(await screen.findByText("4/10")).toBeTruthy();
    expect(screen.getByText("Meghna Iyer")).toBeTruthy();
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
    // Submissions tab: review a seeded piece → Creator OS connection line.
    fireEvent.click(screen.getByRole("button", { name: /^Submissions$/ }));
    const before = screen.queryAllByText(/can now place this piece in their Creator OS/).length;
    fireEvent.click((await screen.findAllByRole("button", { name: /Ship — reviewed on the call/ }))[0]);
    await waitFor(() =>
      expect(screen.getAllByText(/can now place this piece in their Creator OS/).length).toBe(before + 1),
    );
    // Export exists and confirms.
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(await screen.findByRole("button", { name: /Exported/ })).toBeTruthy();
  }, 20000);

  it("the People view shows the cohort", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Feed/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /People/ }));
    expect(await screen.findByText("Meghna Iyer")).toBeTruthy();
    expect(screen.getByText(/Filmmaking · your mentor/)).toBeTruthy();
  });
});
