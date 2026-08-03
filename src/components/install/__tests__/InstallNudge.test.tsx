import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * InstallNudge — the two MOUNTS, and the claim the phase actually has to make:
 * with `VITE_INSTALL_NUDGE` off (its shipped default) this component is not a
 * quieter card, it is nothing at all — no DOM, and no `beforeinstallprompt`
 * listener put on `window` by the act of importing it.
 *
 * That second half is the part reasoning cannot settle. Importing this module
 * calls `registerInstallCapture()`, whose handler `preventDefault()`s the
 * browser's own install mini-infobar for every web visitor. Whether Chromium
 * fires that event for this app today (there is no service worker in this repo)
 * is a browser-version question this suite cannot answer — so instead it proves
 * the flag makes the question moot: flag down, there is no listener to fire into
 * and no card to render; flag up, both appear. `useInstallMoment.test.ts` covers
 * the decision rules behind the card; this file covers what the page gets.
 *
 * The module is imported dynamically inside each test because the capture
 * registration runs at module scope and must see the flag this test set.
 */

// isNative() is the "already installed?" read. Web, so the offer is live and the
// flag is the only thing left that can suppress it.
vi.mock("@/lib/platform", () => ({
  isNative: () => false,
}));

// This jsdom build ships without a working `localStorage` (same note as
// src/lib/__tests__/flags.test.ts), and that is where `flag()` reads its
// override. Memory-backed mock so the real registry can actually be flipped.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mem = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", {
      value: mem,
      configurable: true,
      writable: true,
    });
  }
}

// Where registerInstallCapture() parks its live handlers. Read to prove no
// listener was attached; cleared between tests so a listener left behind by a
// flag-ON test cannot answer for the flag-OFF one.
interface CaptureHost extends Window {
  __levelupInstallCapture?: {
    beforeInstallPrompt: (event: Event) => void;
    appInstalled: () => void;
  };
}

const clearCapture = (): void => {
  const host = window as CaptureHost;
  const live = host.__levelupInstallCapture;
  if (!live) return;
  window.removeEventListener("beforeinstallprompt", live.beforeInstallPrompt);
  window.removeEventListener("appinstalled", live.appInstalled);
  delete host.__levelupInstallCapture;
};

const loadNudge = async () => {
  vi.resetModules();
  const mod = await import("@/components/install/InstallNudge");
  return mod.default;
};

// Chromium's event, carrying the one method the hook calls. Returned so a test
// can assert whether we claimed it.
const fireInstallPrompt = (): Event => {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt: vi.fn(() => Promise.resolve()) });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

beforeEach(() => {
  installLocalStorageMock();
  clearCapture();
  window.sessionStorage.clear();
});

afterEach(() => {
  clearCapture();
  window.sessionStorage.clear();
});

describe("InstallNudge with VITE_INSTALL_NUDGE off (the default)", () => {
  it("renders nothing at either mount, even with a live captured prompt", async () => {
    const InstallNudge = await loadNudge();
    fireInstallPrompt();

    for (const moment of ["fee-paid", "accepted"] as const) {
      const { container } = render(createElement(InstallNudge, { moment }));
      // Not a hidden card and not an empty wrapper — no node at all, so nothing
      // is reserved, shifted or announced on the page.
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("attaches no beforeinstallprompt listener when the module is imported", async () => {
    await loadNudge();
    expect((window as CaptureHost).__levelupInstallCapture).toBeUndefined();
  });

  it("does not suppress the browser's own install prompt", async () => {
    const InstallNudge = await loadNudge();
    render(createElement(InstallNudge, { moment: "fee-paid" as const }));

    // The whole point of the gate: with the feature dark, install promotion is
    // the browser's business exactly as it was before this component existed.
    expect(fireInstallPrompt().defaultPrevented).toBe(false);
  });
});

describe("InstallNudge with VITE_INSTALL_NUDGE on", () => {
  beforeEach(() => {
    localStorage.setItem("VITE_INSTALL_NUDGE", "true");
  });

  it("renders the offer once the browser hands over a prompt", async () => {
    const InstallNudge = await loadNudge();
    const event = fireInstallPrompt();

    render(createElement(InstallNudge, { moment: "fee-paid" as const }));

    expect(
      screen.getByRole("complementary", {
        name: "Add LevelUp to your home screen",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Get reminded where you left off.")).toBeInTheDocument();
    // And the mini-infobar is claimed, so the applicant is asked once, by us,
    // at a value moment — rather than twice.
    expect(event.defaultPrevented).toBe(true);
  });

  it("still renders nothing when no prompt was ever captured", async () => {
    const InstallNudge = await loadNudge();

    const { container } = render(
      createElement(InstallNudge, { moment: "accepted" as const }),
    );

    // The flag is permission to offer, not a reason to invent an offer: with no
    // event in hand there is no dialog to open, so there is no card and no dead
    // button. This is the state every browser without a service worker is in.
    expect(container).toBeEmptyDOMElement();
  });
});
