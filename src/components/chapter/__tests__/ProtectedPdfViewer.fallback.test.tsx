import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";

/**
 * The floor under the canvas PDF viewer.
 *
 * Canvas rendering is what makes a deck readable on a phone at all — the old
 * <iframe> handed the file to iOS's native PDF plugin, which ignores
 * `#view=FitH` and painted one zoomed-in fragment of page 1 in a box the
 * student could not scroll. But pdf.js can fail in a way that throws nothing:
 * if the Web Worker cannot start or the worker↔page bridge is blocked, render
 * neither resolves nor rejects and the page simply never paints. A student
 * would sit in front of a skeleton indefinitely — strictly worse than the bad
 * rendering it replaced.
 *
 * So the viewer watches for a first paint and, failing one, hands the document
 * back to the platform viewer. These tests pin that the floor holds: silence
 * must degrade to the old behaviour, never to a blank screen.
 */

// jsdom ships neither observer; the component uses ResizeObserver to track its
// render width and IntersectionObserver to render pages lazily.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopObserver);
vi.stubGlobal("IntersectionObserver", NoopObserver);

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock("pdfjs-dist/legacy/build/pdf", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument,
}));

import ProtectedPdfViewer from "@/components/chapter/ProtectedPdfViewer";

/** A document that loads but whose pages never paint — the silent-hang case. */
const hangingDoc = {
  numPages: 3,
  destroy: vi.fn(),
  getPage: vi.fn(() => new Promise(() => {})),
};

describe("ProtectedPdfViewer — never leaves a student on a skeleton", () => {
  beforeEach(() => getDocument.mockReset());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("falls back when the first page never paints", async () => {
    vi.useFakeTimers();
    getDocument.mockReturnValue({ promise: Promise.resolve(hangingDoc), destroy: vi.fn() });
    const onUnavailable = vi.fn();
    render(<ProtectedPdfViewer url="/x.pdf" title="Deck" onUnavailable={onUnavailable} />);

    // Let the document resolve so the watchdog is armed.
    await act(async () => {
      await Promise.resolve();
    });
    expect(onUnavailable, "gave up before the document had a chance to paint").not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(12_001);
    });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back once a page has painted", async () => {
    vi.useFakeTimers();
    getDocument.mockReturnValue({ promise: Promise.resolve(hangingDoc), destroy: vi.fn() });
    const onUnavailable = vi.fn();
    const { unmount } = render(
      <ProtectedPdfViewer url="/x.pdf" title="Deck" onUnavailable={onUnavailable} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Unmounting clears the watchdog; a painted page does the same via its ref.
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(12_001);
    });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("falls back when the document itself cannot be opened", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("network")), destroy: vi.fn() });
    const onUnavailable = vi.fn();
    render(<ProtectedPdfViewer url="/x.pdf" title="Deck" onUnavailable={onUnavailable} />);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });

  it("shows an error instead of hanging when no fallback is wired", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("network")), destroy: vi.fn() });
    render(<ProtectedPdfViewer url="/x.pdf" title="Deck" />);
    await waitFor(() => expect(screen.getByText(/couldn't be opened/i)).toBeTruthy());
  });
});
