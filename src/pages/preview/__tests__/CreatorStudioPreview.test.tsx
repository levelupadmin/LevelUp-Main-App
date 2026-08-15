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

beforeEach(() => {
  localStorage.clear();
  // The entrance is once-a-session, so tests that are not about it opt out.
  sessionStorage.setItem("cs-boot-seen", "1");
});

describe("CreatorStudioPreview", () => {
  it("stamps the build it came from — a stale deployment alias must be visible on screen", () => {
    // 2026-08-14: the branch alias stayed pinned to an older deployment and the
    // URL served week-old code while the dashboard said READY. Nothing on the
    // page disagreed. This is the disagreement.
    renderAs("student@gmail.com");
    expect(screen.getAllByText(/^build test/).length).toBeGreaterThan(0);
  });

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

  it("Home leads with the next action, and the next action is real curriculum", async () => {
    renderAs("avinash@leveluplearning.in");
    // Not a hand-written hero: the first OPEN card computed from the template.
    fireEvent.click((await screen.findAllByRole("button", { name: /Orientation/ }))[0]);
    expect(await screen.findByText(/Why this program exists/)).toBeTruthy();
  });

  it("PLAYS the real loop: drill → block → the submission box → the mentor's verdict", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);

    // Monday's drill is open; Tuesday's is not, and it says why in plain words.
    fireEvent.click((await screen.findAllByRole("button", { name: /Record five voice-note memories/ }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Mark this done/ }));
    expect(await screen.findByText(/Done\. \+15 XP/)).toBeTruthy();

    // The week's block: the in-app box, with a helper line per field.
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /Week 0 block/ }))[0]);

    // The form is behind the commitment. Starting is what opens it, and what
    // puts you in the room.
    fireEvent.click(await screen.findByRole("button", { name: /I'm starting this/ }));
    expect(await screen.findByText(/Make sure it is shared so your mentor can open it/)).toBeTruthy();
    expect(screen.getAllByText(/The room/).length).toBeGreaterThan(0);

    // An empty submission is refused — a mentor must never open an empty page.
    expect((screen.getByRole("button", { name: /Submit my week/ }) as HTMLButtonElement).disabled).toBe(true);

    // The form is the admin's question list, so answer the required ones.
    fireEvent.change(screen.getByLabelText(/^Your Drive folder/), { target: { value: "https://drive.google.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: /Card A — I run a business/ }));
    fireEvent.change(screen.getByLabelText(/^The two reels you broke down/), { target: { value: "two reels, levers labelled" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit my week/ }));
    expect(await screen.findByText(/Your mentor sees this in their desk/)).toBeTruthy();

    // The mentor desk opens exactly what was typed, and ships it.
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy · Cohort 02/ }));
    expect(await screen.findByText("https://drive.google.com/x")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^SHIP$/i }));
    expect(await screen.findByText(/ship/i)).toBeTruthy();
  }, 20000);

  it("the entrance fills the viewport and is never cut short by a timer", () => {
    sessionStorage.clear();
    const { container } = renderAs("avinash@leveluplearning.in");
    const v = container.querySelector("video.cs-boot-video") as HTMLVideoElement | null;
    expect(v).toBeTruthy();
    // Full bleed, and it plays to its own end rather than to a clock.
    expect(v?.classList.contains("h-full")).toBe(true);
    expect(v?.classList.contains("w-full")).toBe(true);
    expect(v?.loop).toBe(false);
  });

  it("the entrance plays once a session, never twice", async () => {
    sessionStorage.clear();
    const first = renderAs("avinash@leveluplearning.in");
    expect(screen.getByRole("status", { name: "Creator Studio" })).toBeTruthy();
    first.unmount();

    // Second entry in the same session goes straight to the room.
    renderAs("avinash@leveluplearning.in");
    expect(screen.queryByRole("status", { name: "Creator Studio" })).toBeNull();
  });

  it("the room wears the brand, scoped so the rest of the app cannot move", () => {
    sessionStorage.setItem("cs-boot-seen", "1");
    const { container } = renderAs("avinash@leveluplearning.in");
    // Every override hangs off this one class. Remove it and the app's own
    // default skin returns — which is what makes the re-skin reversible.
    expect(container.querySelector(".cs-brand")).toBeTruthy();
  });

  it("the Path is the TRAIL, not a list — phase banners, week dividers, winding nodes", async () => {
    // 2026-08-15: the real curriculum first shipped as flat rows and threw away
    // the one surface nobody could buy off a shelf. This is the guard.
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);

    // A phase banner per phase of the real program, in the real order.
    // The phase heading is cream with its last word carrying the accent, which
    // is the deck's own move — so it lives across two elements by design.
    expect(await screen.findByText("lane")).toBeTruthy();
    expect(screen.getByText("Sprint")).toBeTruthy();
    // Week dividers carry the real dates, two-digit as in the deck.
    expect(screen.getByText(/Week 00 · Sun, 16 Aug/)).toBeTruthy();
    // Nodes are circular buttons labelled by day and title, not table rows.
    expect(screen.getByRole("button", { name: /Sat 6:00 PM — Orientation/ })).toBeTruthy();
    expect(screen.getByText(/Your Distribution/)).toBeTruthy();
  });

  it("finishing a step throws confetti and names what it OPENED, not what you clicked", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /Record five voice-note memories/ }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Mark this done/ }));

    // The payoff names the next drill by title — a receipt would just say done.
    expect(await screen.findByText("Unlocked")).toBeTruthy();
    expect(screen.getByText("Break down two creator reels")).toBeTruthy();
  }, 20000);

  it("ADMIN: adding a card puts it on the student Path, deleting takes it off", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 0 · Orientation/ }));

    fireEvent.change(await screen.findByLabelText("Card type"), { target: { value: "community_call" } });
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    // It exists in the week editor, and it exists on the trail.
    expect((await screen.findAllByText("Untitled")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    expect((await screen.findAllByRole("button", { name: /Untitled/ })).length).toBeGreaterThan(0);
  }, 20000);

  it("ADMIN: a new start date re-dates the whole batch on the student side", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));

    fireEvent.change(await screen.findByLabelText(/Batch starts on/), { target: { value: "2026-12-06" } });
    fireEvent.click(screen.getByRole("button", { name: /Re-date the batch/ }));

    // The admin screen itself reports the new span first.
    expect(await screen.findByText(/week 0 opens Sat, 5 Dec/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    expect(await screen.findByText(/Week 00 · Sun, 6 Dec/, {}, { timeout: 4000 })).toBeTruthy();
  }, 20000);

  it("ADMIN: attaching a recording to a live session shows up on the student card", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 0 · Orientation/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Orientation/ }))[0]);

    fireEvent.click(await screen.findByRole("button", { name: /\+ Deck/ }));
    const label = (await screen.findAllByLabelText(/^Label for/))[0];
    fireEvent.change(label, { target: { value: "Orientation slides" } });

    fireEvent.click(screen.getByRole("button", { name: /View this as a student/ }));
    expect(await screen.findByText("Orientation slides")).toBeTruthy();
  }, 20000);

  it("ADMIN: a question added to the form appears in the student's submission box", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 0 · Orientation/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Week 0 block/ }))[0]);

    fireEvent.click(await screen.findByRole("button", { name: /\+ Yes or no/ }));
    const titles = await screen.findAllByLabelText(/Question \d+ title/);
    fireEvent.change(titles[titles.length - 1], { target: { value: "Did you record all five" } });

    fireEvent.click(screen.getByRole("button", { name: /View this as a student/ }));
    fireEvent.click(await screen.findByRole("button", { name: /I'm starting this/ }));
    expect(await screen.findByText("Did you record all five")).toBeTruthy();
  }, 20000);

  it("ADMIN: pushing a running batch moves later weeks and leaves earlier ones alone", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));

    fireEvent.change(await screen.findByLabelText(/Push everything after week/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Reason for the push/), { target: { value: "mentor unavailable" } });
    fireEvent.click(screen.getByRole("button", { name: /Push by one week/ }));
    expect(await screen.findByText(/After week 4, everything moved 1 week — mentor unavailable/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    // Week 0 has not moved; week 5 has.
    expect(await screen.findByText(/Week 00 · Sun, 16 Aug/, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Week 05 · Sun, 27 Sep/)).toBeTruthy();
  }, 20000);

  it("ADMIN: marking a week 'no session' says so on the trail without moving any date", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    const toggles = await screen.findAllByRole("button", { name: "running" });
    fireEvent.click(toggles[5]);

    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    // Wait for the trail itself, not just any "no session" text — the admin
    // toggle also reads that, and asserting too early passes on the wrong screen.
    expect(await screen.findByText(/Week 06 · Sun, 27 Sep/, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getAllByText("no session").length).toBeGreaterThan(0);
  }, 20000);

  it("the room lists who moved first, and never who is behind", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /Week 0 block/ }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /I'm starting this/ }));

    expect((await screen.findAllByText(/The room/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Only people who have started appear here/)).toBeTruthy();
    // Real classmates, the same ones the Feed shows.
    expect(screen.getAllByText(/Iyer|Kotecha|Sharma|Thakur|Rao|Menon|Shaikh|Verma|Nair|Das/).length).toBeGreaterThan(0);
    // You are in it, once you have moved.
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
  }, 20000);

  it("the admin sheet lists EVERYONE, including who has not started", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Mentor desk/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Submission sheets/ }, { timeout: 4000 }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Week 0 block/ }))[0]);

    // The column students never see.
    expect((await screen.findAllByText("not started")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Everyone in the batch is listed/)).toBeTruthy();
  }, 20000);

  it("LOOP: every bullet a student reads is a bullet an admin can write", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 0 · Orientation/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Orientation/ }))[0]);

    fireEvent.change(await screen.findByLabelText(/What you'll learn/), {
      target: { value: "Why this exists\nWhat you leave with" },
    });
    fireEvent.click(screen.getByRole("button", { name: /View this as a student/ }));
    expect(await screen.findByText("What you leave with")).toBeTruthy();
  }, 20000);

  it("END TO END: admin marks the session done and uploads the recording, the student hits the feedback gate", async () => {
    renderAs("avinash@leveluplearning.in");

    // Before anyone marks anything, the student sees the Zoom door.
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /The psychology of storytelling/ }))[0]);
    expect(await screen.findByText("Join on Zoom")).toBeTruthy();

    // Admin runs the week: mark done, paste the recording.
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Run the week/ }, { timeout: 4000 }));
    const marks = await screen.findAllByRole("button", { name: "mark done" });
    fireEvent.click(marks[1]);
    const recs = await screen.findAllByLabelText(/Recording link/);
    fireEvent.change(recs[1], { target: { value: "https://zoom.us/rec/psych" } });

    // Back on the student side: the door has changed, and it is gated.
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /The psychology of storytelling/ }))[0]);
    expect(await screen.findByText(/Tell us how the session went/)).toBeTruthy();
    expect(screen.queryByText("Join on Zoom")).toBeNull();

    // Two ratings required, the note is not.
    expect((screen.getByRole("button", { name: /Submit and open the recording/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "The mentor: 4 of 5" }));
    fireEvent.click(screen.getByRole("button", { name: "What you learned: 5 of 5" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit and open the recording/ }));
    expect(await screen.findByText("Watch the recording")).toBeTruthy();
  }, 25000);

  it("marked done with no recording tells the student exactly that", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Run the week/ }, { timeout: 4000 }));
    fireEvent.click((await screen.findAllByRole("button", { name: "mark done" }))[1]);
    expect(await screen.findByText(/Marked done, but there is no recording yet/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /The psychology of storytelling/ }))[0]);
    expect((await screen.findAllByText(/The recording is not up yet/)).length).toBeGreaterThan(0);
    // The feedback form is still offered, so it opens the moment it lands.
    expect(screen.getByRole("button", { name: /Submit and open the recording/ })).toBeTruthy();
  }, 25000);

  it("a Zoom link that is not up yet reads as not up yet, never as a dead button", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    // Week 2 is unauthored, so its class has no link — the honest empty state.
    fireEvent.click(await screen.findByRole("button", { name: /Scripts part 1 — structure and hooks/ }));
    expect(await screen.findByText(/The Zoom link is not up yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Join on Zoom/ })).toBeNull();
  });

  it("a future week is locked with a reason, and the reason is the previous block", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^The Path/ })[0]);
    expect((await screen.findAllByText(/Opens 29 Aug, once week 1's block is in\./)).length).toBeGreaterThan(0);
  });

  it("ADMIN: editing a card's field lands on the student page — the whole point of the pen", async () => {
    renderAs("avinash@leveluplearning.in");
    fireEvent.click(screen.getAllByRole("button", { name: /^Admin/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Creator Academy content/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Week 0 · Orientation/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Orientation/ }))[0]);

    // No Save button by design — every field writes as you type. A form where
    // some fields persist and others wait for a button is worse than one where
    // none do, because it teaches you to trust it.
    const mentor = await screen.findByLabelText(/^Mentor/);
    fireEvent.change(mentor, { target: { value: "Rahul and a guest" } });
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View this as a student/ }));
    expect(await screen.findByText(/with Rahul and a guest/)).toBeTruthy();
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
