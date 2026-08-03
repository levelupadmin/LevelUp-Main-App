import { afterEach, describe, expect, it, vi } from "vitest";

import { track } from "@/lib/analytics";

describe("room analytics vocabulary", () => {
  afterEach(() => {
    delete window.posthog;
  });

  it("fans out exactly the seven room events with their canonical payloads", () => {
    const capture = vi.fn();
    window.posthog = { capture } as unknown as NonNullable<typeof window.posthog>;

    track({ name: "room_opened", slug: "season-one", phase: "wrap" });
    track({ name: "room_session_join_tapped", sessionId: "session-1", state: "live" });
    track({ name: "room_recording_played", resumed: true });
    track({ name: "room_assignment_submitted", weekN: 4, late: false });
    track({ name: "room_announcement_seen" });
    track({ name: "room_demo_entry_submitted" });
    track({ name: "room_switched" });

    expect(capture.mock.calls).toEqual([
      ["room_opened", { slug: "season-one", phase: "wrap" }],
      ["room_session_join_tapped", { session_id: "session-1", state: "live" }],
      ["room_recording_played", { resumed: true }],
      ["room_assignment_submitted", { week_n: 4, late: false }],
      ["room_announcement_seen", {}],
      ["room_demo_entry_submitted", {}],
      ["room_switched", {}],
    ]);
  });
});
