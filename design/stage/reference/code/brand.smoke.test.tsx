// Render test for the Stage brand reference code.
// Target path: src/components/brand/__tests__/brand.smoke.test.tsx
import { render, act } from "@testing-library/react";
import { vi } from "vitest";
import { LevelUpMark } from "@/components/brand/LevelUpMark";
import { BrandIntro } from "@/components/brand/BrandIntro";
import { pickIntroMode } from "@/lib/intro";
import { SignInMoment } from "@/components/brand/SignInMoment";
import { LevelUpLoader } from "@/components/brand/LevelUpLoader";
import { brandIntroNodeCuesMs } from "@/lib/brand-moments";
import { setAccent, setThemePref, STAGE_ENABLED } from "@/lib/appearance";
import { playSound, playSonicLogo, setSoundEnabled, suppressSounds } from "@/lib/sound";

describe("stage brand reference code", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("renders the static mark with 7 letters + 8 'learning' paths, 4 nodes, 3 links", () => {
    const { container } = render(<LevelUpMark />);
    expect(container.querySelectorAll("path").length).toBe(7 + 8);
    expect(container.querySelectorAll("circle").length).toBe(4);
    expect(container.querySelectorAll("line").length).toBe(3);
  });

  it("fires onNode 0..3 in order and onDrawn once on the intro timeline", () => {
    vi.useFakeTimers();
    const onNode = vi.fn();
    const onDrawn = vi.fn();
    render(<LevelUpMark play="intro" onNode={onNode} onDrawn={onDrawn} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onNode.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3]);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it("node cues are 1250/1450/1650/1850 ms", () => {
    expect(brandIntroNodeCuesMs).toEqual([1250, 1450, 1650, 1850]);
  });

  it("picks the right intro", () => {
    expect(pickIntroMode({ signedIn: false, homeCached: false, openedFromLink: true })).toBeNull();
    expect(pickIntroMode({ signedIn: true, homeCached: true, openedFromLink: false })).toBeNull();
    expect(pickIntroMode({ signedIn: true, homeCached: false, openedFromLink: false, nowMs: 300 })).toBe("return");
    expect(pickIntroMode({ signedIn: false, homeCached: false, openedFromLink: false })).toBe("first");
    // mounted too late for the return beat to finish inside the 1s budget
    expect(pickIntroMode({ signedIn: true, homeCached: false, openedFromLink: false, nowMs: 800 })).toBeNull();
    localStorage.setItem("lu.introSeen", "1");
    expect(pickIntroMode({ signedIn: false, homeCached: false, openedFromLink: false })).toBeNull();
  });

  it("the return beat finishes quickly once Home is ready, even without animation callbacks", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BrandIntro mode="return" ready onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("the first-launch intro marks itself seen and always finishes", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BrandIntro mode="first" posters={["a.jpg", "b.jpg"]} onDone={onDone} />);
    expect(localStorage.getItem("lu.introSeen")).toBe("1");
    act(() => {
      vi.advanceTimersByTime(2800); // hold ends, exit starts
    });
    act(() => {
      vi.advanceTimersByTime(1000); // exit + safety timer
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("the sign-in moment reveals and finishes once", () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const onDone = vi.fn();
    render(<SignInMoment eyebrow="Welcome back" title="Arjun" onReveal={onReveal} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(2400); // hold ends, Home is revealed underneath
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000); // exit + safety timer
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("renders the loader", () => {
    render(<LevelUpLoader />);
  });

  it("sound and appearance calls are safe with no AudioContext and the flag off", () => {
    setSoundEnabled(true);
    const release = suppressSounds();
    release();
    release(); // idempotent
    playSound("success");
    playSonicLogo();
    setAccent("mono");
    setThemePref("dark");
    expect(STAGE_ENABLED).toBe(false);
    expect(document.documentElement.getAttribute("data-brand")).toBeNull();
  });
});
