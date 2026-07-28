import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useInstallMoment — the rules that keep install an offer rather than a wall:
 * native never offers (and never even listens), there are exactly two moments
 * and no more, a dismissal suppresses the rest of the session, the browser's
 * mini-infobar is claimed at capture so the applicant is never asked twice at
 * once, and a refused `prompt()` neither leaves a dead tap behind nor reports
 * a dialog that was never shown.
 *
 * The hook keeps its captured `beforeinstallprompt` in MODULE state (it must
 * survive between the two moments, which are different renders on different
 * days), so every test re-imports the module through `vi.resetModules()` to get
 * a clean store and a freshly-registered window listener. That is also why the
 * import is dynamic rather than top-of-file.
 */

// Platform is read through a mutable flag so a single test can flip the app into
// the installed native shell without re-mocking the module.
let native = false;
vi.mock("@/lib/platform", () => ({
  isNative: () => native,
}));

type HookModule = typeof import("@/hooks/useInstallMoment");

const loadHook = async (): Promise<HookModule> => {
  vi.resetModules();
  return import("@/hooks/useInstallMoment");
};

// Dispatch a `beforeinstallprompt` the way Chromium does, carrying the single
// method the hook calls. `Event` is not constructible with extra members, so the
// prompt is attached after construction — same shape the hook casts to. The
// event is returned so a test can assert on `defaultPrevented`.
const promptSpy = vi.fn(() => Promise.resolve());
const fireInstallPrompt = (): Event => {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt: promptSpy });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

beforeEach(() => {
  native = false;
  promptSpy.mockClear();
  promptSpy.mockImplementation(() => Promise.resolve());
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("useInstallMoment", () => {
  it("never offers inside the native shell, at either moment", async () => {
    native = true;
    const { useInstallMoment, INSTALL_MOMENTS } = await loadHook();
    fireInstallPrompt();

    for (const moment of INSTALL_MOMENTS) {
      const { result } = renderHook(() => useInstallMoment(moment));
      expect(result.current.offered).toBe(false);
    }
  });

  it("offers at exactly two moments and no more", async () => {
    const { useInstallMoment, INSTALL_MOMENTS } = await loadHook();
    fireInstallPrompt();

    // The registry itself is the cap: two entries, and these two.
    expect(INSTALL_MOMENTS).toHaveLength(2);
    expect([...INSTALL_MOMENTS]).toEqual(["fee-paid", "accepted"]);

    for (const moment of INSTALL_MOMENTS) {
      const { result } = renderHook(() => useInstallMoment(moment));
      expect(result.current.offered).toBe(true);
    }

    // Anything outside the registry stays silent even with a live prompt in
    // hand, so a call site that widens the moment to a string cannot invent a
    // third interruption.
    const { result: unregistered } = renderHook(() =>
      useInstallMoment("enrolled" as never),
    );
    expect(unregistered.current.offered).toBe(false);
  });

  it("suppresses every moment for the rest of the session once dismissed", async () => {
    const { useInstallMoment, INSTALL_DISMISSED_KEY } = await loadHook();
    fireInstallPrompt();

    const feePaid = renderHook(() => useInstallMoment("fee-paid"));
    expect(feePaid.result.current.offered).toBe(true);

    act(() => {
      feePaid.result.current.dismiss();
    });

    expect(feePaid.result.current.offered).toBe(false);
    expect(window.sessionStorage.getItem(INSTALL_DISMISSED_KEY)).toBe("1");

    // The OTHER moment, reached later in the same session, is silent too — a
    // dismissal ends the ask, it does not just skip one card.
    const { result: accepted } = renderHook(() => useInstallMoment("accepted"));
    expect(accepted.current.offered).toBe(false);
  });

  it("renders nothing when no prompt was ever captured", async () => {
    const { useInstallMoment } = await loadHook();

    const { result } = renderHook(() => useInstallMoment("fee-paid"));
    expect(result.current.offered).toBe(false);

    // And firing it is a safe no-op rather than a throw, so a stale call site
    // can never produce a dead button that errors on tap.
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(promptSpy).not.toHaveBeenCalled();
    // "unavailable", not "shown": the caller announces from this value, so it
    // must never claim a dialog that never opened.
    expect(outcome).toBe("unavailable");
  });

  it("spends the captured prompt once and stops asking afterwards", async () => {
    const { useInstallMoment } = await loadHook();
    fireInstallPrompt();

    const { result } = renderHook(() => useInstallMoment("fee-paid"));
    expect(result.current.offered).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("shown");
    expect(result.current.offered).toBe(false);

    // A second tap cannot replay a spent prompt (calling prompt() twice throws
    // in Chromium), so the hook must not forward it again.
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(promptSpy).toHaveBeenCalledTimes(1);
  });

  it("hands the offer back when the user agent refuses to show the prompt", async () => {
    const { useInstallMoment, INSTALL_DISMISSED_KEY } = await loadHook();
    fireInstallPrompt();

    const { result } = renderHook(() => useInstallMoment("fee-paid"));

    promptSpy.mockRejectedValueOnce(new Error("prompt() refused"));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    // A refusal must NOT look like a dismissal: the card is still on screen and
    // the session is not closed, so the tap is recoverable rather than dead.
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(result.current.offered).toBe(true);
    expect(window.sessionStorage.getItem(INSTALL_DISMISSED_KEY)).toBeNull();
    // The outcome is what the card announces from. "refused" is what keeps it
    // from telling a screen-reader user that a dialog opened.
    expect(outcome).toBe("refused");

    // …and the retry goes through.
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(outcome).toBe("shown");
    expect(result.current.offered).toBe(false);
  });

  it("retires the offer rather than leaving a dead button when refusal repeats", async () => {
    const { useInstallMoment } = await loadHook();
    fireInstallPrompt();

    const { result } = renderHook(() => useInstallMoment("fee-paid"));

    promptSpy.mockRejectedValue(new Error("permanently stale"));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(result.current.offered).toBe(true);
    expect(outcome).toBe("refused");

    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    // Budget spent. The card goes away entirely — a vanished offer is honest,
    // a button that silently does nothing on every tap is not. "retired" is how
    // the card knows to announce the retirement instead of a dialog.
    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(outcome).toBe("retired");
    expect(result.current.offered).toBe(false);

    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(outcome).toBe("unavailable");
  });

  it("claims the browser's mini-infobar at capture, before any moment can mount", async () => {
    const { useInstallMoment } = await loadHook();

    // Real-world ordering: Chromium fires this once, seconds after load, while
    // the applicant is still nowhere near the lazily-loaded application route.
    // preventDefault() is only effective inside that handler, so it happens
    // there or not at all — otherwise the browser's own bar stays up and the
    // applicant gets asked twice when the card finally arrives.
    const event = fireInstallPrompt();
    expect(event.defaultPrevented).toBe(true);

    // …and the moment mounted minutes later still has the offer in hand.
    const { result } = renderHook(() => useInstallMoment("fee-paid"));
    expect(result.current.offered).toBe(true);
  });

  it("does not listen at all, or claim the browser's affordance, inside the native shell", async () => {
    native = true;
    const { useInstallMoment } = await loadHook();

    renderHook(() => useInstallMoment("fee-paid"));
    const event = fireInstallPrompt();
    expect(event.defaultPrevented).toBe(false);
  });
});
