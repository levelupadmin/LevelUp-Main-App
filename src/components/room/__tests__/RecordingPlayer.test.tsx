import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import RecordingPlayer, {
  type EmbeddableRecording,
} from "@/components/room/RecordingPlayer";

/**
 * RecordingPlayer — the COMPONENT.
 *
 * `RoomScreenings.test.tsx` proves what the shelf WRITES, and it exercises this
 * file's two pure exports (`parseEmbeddableRecording`, `embedSrc`) directly. What
 * neither of those can reach is the part of the player that talks to a
 * third-party frame, and that is the part that cannot be verified by reading:
 *
 *   1. the handshake actually goes out, to the provider's origin, in the shape
 *      that provider answers;
 *   2. it is BOUNDED — a silent player (a `capacitor://` origin YouTube will not
 *      run its JS API for) stops being asked, rather than being asked forever;
 *   3. Vimeo's `ready`-then-subscribe ordering, which no other test covers;
 *   4. the `event.source === iframe.contentWindow` gate, which is the file's
 *      ENTIRE trust model, so a message from any other window must do nothing;
 *   5. nothing survives unmount — no listener, no retry timer, no callback.
 *
 * Every message here is dispatched exactly as the real provider sends it: a JSON
 * STRING from YouTube, a plain OBJECT from Vimeo, both sourced from the embed's
 * own `contentWindow`, because that identity is what the component trusts.
 */

const YOUTUBE: EmbeddableRecording = { provider: "youtube", id: "dQw4w9WgXcQ", hash: null };
const VIMEO: EmbeddableRecording = { provider: "vimeo", id: "76979871", hash: "a1b2c3d4e5" };

const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";
const VIMEO_ORIGIN = "https://player.vimeo.com";

/** The interval the handshake retries on — long enough to matter, short to test. */
const RETRY_MS = 500;

interface Mounted {
  frame: HTMLIFrameElement;
  /** Everything posted INTO the frame after mount (the retries and `ready` reply). */
  posts: () => string[];
  onProgress: ReturnType<typeof vi.fn>;
  rerender: (node: React.ReactElement) => void;
  unmount: () => void;
}

function mountPlayer(
  recording: EmbeddableRecording,
  startSeconds: number | null = null,
): Mounted {
  const onProgress = vi.fn();
  const { container, rerender, unmount } = render(
    <RecordingPlayer
      recording={recording}
      title="The cut that carries"
      startSeconds={startSeconds}
      onProgress={onProgress}
    />,
  );
  const frame = container.querySelector("iframe") as HTMLIFrameElement;
  expect(frame).toBeTruthy();
  const spy = vi.spyOn(frame.contentWindow as Window, "postMessage");
  return {
    frame,
    posts: () => spy.mock.calls.map((call) => String(call[0])),
    onProgress,
    rerender,
    unmount,
  };
}

/** One inbound frame, from whichever window the test wants to claim sent it. */
function deliver(source: Window | null, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { source, data }));
  });
}

/** YouTube's `infoDelivery`, verbatim: a JSON string carrying `info.currentTime`. */
const youtubeTick = (currentTime: number, duration: number) =>
  JSON.stringify({
    event: "infoDelivery",
    id: 1,
    channel: "widget",
    info: { currentTime, duration, playerState: 1 },
  });

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("RecordingPlayer — the frame", () => {
  it("embeds only the whitelisted provider host, with the resume offset baked in", () => {
    const { frame } = mountPlayer(YOUTUBE, 750);

    const src = frame.getAttribute("src") ?? "";
    expect(src.startsWith(`${YOUTUBE_ORIGIN}/embed/dQw4w9WgXcQ?`)).toBe(true);
    expect(src).toContain("start=750");
    expect(frame.getAttribute("title")).toBe("The cut that carries");
    // No camera, no microphone, no payment — a recording needs none of them.
    expect(frame.getAttribute("allow")).not.toMatch(/camera|microphone|payment/);
    expect(frame.getAttribute("referrerPolicy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps the src it was born with, so a new position never restarts playback", () => {
    const { frame, rerender } = mountPlayer(YOUTUBE, 750);
    const src = frame.getAttribute("src");

    // The caller re-renders with a later position on every tick.
    rerender(
      <RecordingPlayer
        recording={YOUTUBE}
        title="The cut that carries"
        startSeconds={1500}
        onProgress={vi.fn()}
      />,
    );

    expect(frame.getAttribute("src")).toBe(src);
  });
});

describe("RecordingPlayer — the YouTube handshake", () => {
  it("asks the player to start talking, in its own shape, at its own origin", () => {
    const { posts } = mountPlayer(YOUTUBE);

    advance(RETRY_MS);
    expect(posts()).toContain('{"event":"listening","id":1,"channel":"widget"}');
  });

  it("gives up on a silent player instead of retrying forever", () => {
    // The real case: a `capacitor://` origin, which YouTube will not run the JS
    // API for. The frame simply never answers, and this must not become a
    // permanent timer inside a room that already owns a clock.
    const { posts } = mountPlayer(YOUTUBE);

    advance(10 * RETRY_MS);
    const settled = posts().length;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(10);

    advance(120_000);
    expect(posts().length).toBe(settled);
  });

  it("stops asking the moment the player answers", () => {
    const { frame, posts, onProgress } = mountPlayer(YOUTUBE);

    advance(RETRY_MS);
    deliver(frame.contentWindow, youtubeTick(42, 3600));
    expect(onProgress).toHaveBeenCalledWith(42, 3600);

    const settled = posts().length;
    advance(10 * RETRY_MS);
    expect(posts().length).toBe(settled);
  });

  it("ignores frames that carry no position", () => {
    const { frame, onProgress } = mountPlayer(YOUTUBE);

    deliver(frame.contentWindow, JSON.stringify({ event: "onReady", id: 1 }));
    deliver(frame.contentWindow, JSON.stringify({ event: "infoDelivery", info: {} }));
    deliver(frame.contentWindow, JSON.stringify({ event: "infoDelivery", info: null }));
    deliver(frame.contentWindow, "not json at all");
    deliver(frame.contentWindow, 42);
    deliver(frame.contentWindow, null);

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("reports a position with no duration when the player volunteers none", () => {
    const { frame, onProgress } = mountPlayer(YOUTUBE);

    deliver(
      frame.contentWindow,
      JSON.stringify({ event: "infoDelivery", info: { currentTime: 12.7 } }),
    );

    expect(onProgress).toHaveBeenCalledWith(12.7, null);
  });
});

describe("RecordingPlayer — Vimeo's ready-then-subscribe order", () => {
  it("subscribes to timeupdate only after the player announces itself", () => {
    const { frame, posts } = mountPlayer(VIMEO);
    const subscription = '{"method":"addEventListener","value":"timeupdate"}';

    // Vimeo posts objects, not strings, and it announces `ready` first.
    deliver(frame.contentWindow, { event: "ready" });
    expect(posts()).toContain(subscription);
  });

  it("reads a timeupdate frame's seconds and duration", () => {
    const { frame, onProgress } = mountPlayer(VIMEO);

    deliver(frame.contentWindow, { event: "ready" });
    deliver(frame.contentWindow, {
      event: "timeupdate",
      data: { seconds: 930.4, duration: 3600, percent: 0.25 },
    });

    expect(onProgress).toHaveBeenCalledWith(930.4, 3600);
  });

  it("posts to the Vimeo origin and nowhere else", () => {
    const { frame } = mountPlayer(VIMEO);
    const spy = vi.spyOn(frame.contentWindow as Window, "postMessage");

    advance(RETRY_MS);
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) expect(call[1]).toBe(VIMEO_ORIGIN);
  });
});

describe("RecordingPlayer — the trust gate", () => {
  it("refuses a perfectly-shaped tick from any window that is not the frame", () => {
    const { frame, onProgress } = mountPlayer(YOUTUBE);
    const tick = youtubeTick(1800, 3600);

    // The page itself, an unrelated frame, and a message with no source at all.
    const other = document.createElement("iframe");
    document.body.appendChild(other);

    deliver(window, tick);
    deliver(other.contentWindow, tick);
    deliver(null, tick);

    expect(onProgress).not.toHaveBeenCalled();

    // The same payload from the real frame is honoured, so the fixture is sound.
    deliver(frame.contentWindow, tick);
    expect(onProgress).toHaveBeenCalledWith(1800, 3600);

    other.remove();
  });

  it("does not let a foreign `ready` frame provoke a subscription", () => {
    const { posts } = mountPlayer(VIMEO);
    const before = posts().length;

    deliver(window, { event: "ready" });

    expect(posts().length).toBe(before);
  });
});

describe("RecordingPlayer — nothing outlives the mount", () => {
  it("delivers to the latest handler without re-arming the listener", () => {
    const added = vi.spyOn(window, "addEventListener");
    const { frame, rerender } = mountPlayer(YOUTUBE);
    const messageListeners = () =>
      added.mock.calls.filter(([type]) => type === "message").length;
    const armed = messageListeners();

    // The shelf passes an inline arrow, so this is what every parent render does.
    const second = vi.fn();
    for (let i = 0; i < 3; i += 1) {
      rerender(
        <RecordingPlayer
          recording={YOUTUBE}
          title="The cut that carries"
          startSeconds={750}
          onProgress={second}
        />,
      );
    }

    expect(messageListeners()).toBe(armed);
    deliver(frame.contentWindow, youtubeTick(99, 3600));
    expect(second).toHaveBeenCalledWith(99, 3600);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening, stops retrying, and reports nothing after unmount", () => {
    // Counted, not assumed: a leaked `message` listener is invisible from the
    // outside (the unmounted component's frame ref is already null, so it would
    // return early anyway), and the point of the cleanup is that nothing is left
    // attached to `window` at all.
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const countMessage = (spy: typeof added) =>
      spy.mock.calls.filter(([type]) => type === "message").length;

    const { frame, posts, onProgress, unmount } = mountPlayer(YOUTUBE);
    const target = frame.contentWindow;

    advance(RETRY_MS);
    const before = posts().length;
    expect(countMessage(added)).toBeGreaterThan(0);

    unmount();
    expect(countMessage(removed)).toBe(countMessage(added));

    deliver(target, youtubeTick(2400, 3600));
    advance(120_000);

    expect(onProgress).not.toHaveBeenCalled();
    expect(posts().length).toBe(before);
  });
});
