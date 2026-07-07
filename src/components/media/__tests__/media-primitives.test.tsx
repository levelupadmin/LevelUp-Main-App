import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtworkImage } from "../ArtworkImage";
import { AmbientGlow } from "../AmbientGlow";

describe("ArtworkImage", () => {
  it("renders the branded placeholder when src is missing", () => {
    render(<ArtworkImage src={undefined} alt="Course art" />);
    expect(screen.getByTestId("artwork-placeholder")).toBeInTheDocument();
    // No real <img> element renders, but the placeholder stands in for the
    // artwork with role="img" + aria-label so the meaning is still announced.
    expect(
      screen.getByRole("img", { name: "Course art" }),
    ).toBe(screen.getByTestId("artwork-placeholder"));
  });

  it("surfaces role=img + aria-label={alt} on the placeholder when alt is non-empty", () => {
    render(<ArtworkImage src={undefined} alt="Course art" />);
    const placeholder = screen.getByTestId("artwork-placeholder");
    expect(placeholder).toHaveAttribute("role", "img");
    expect(placeholder).toHaveAttribute("aria-label", "Course art");
    expect(placeholder).not.toHaveAttribute("aria-hidden");
  });

  it("keeps the placeholder aria-hidden for decorative (empty alt) usage", () => {
    render(<ArtworkImage src={undefined} alt="" />);
    const placeholder = screen.getByTestId("artwork-placeholder");
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder).not.toHaveAttribute("role");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the branded placeholder when the image errors", () => {
    render(<ArtworkImage src="https://example.com/broken.jpg" alt="Broken" />);
    // Before the error, the real <img> is present.
    const img = screen.getByRole("img", { name: "Broken" });
    expect(img.tagName).toBe("IMG");

    fireEvent.error(img);

    const placeholder = screen.getByTestId("artwork-placeholder");
    expect(placeholder).toBeInTheDocument();
    // The error placeholder now carries the accessible name so a screen reader
    // still conveys the artwork even though the source failed to load.
    expect(placeholder).toHaveAttribute("role", "img");
    expect(placeholder).toHaveAttribute("aria-label", "Broken");
    expect(screen.getByRole("img", { name: "Broken" })).toBe(placeholder);
  });

  it("enforces the requested aspect ratio and object-cover on the wrapper", () => {
    const { container } = render(
      <ArtworkImage src="https://example.com/a.jpg" alt="Poster" aspect="poster" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass("aspect-[2/3]");

    const img = screen.getByRole("img");
    expect(img).toHaveClass("object-cover");
    expect(img).toHaveClass("dark-img");
  });

  it("defaults to the video aspect and fades in on load", () => {
    const { container } = render(
      <ArtworkImage src="https://example.com/a.jpg" alt="Video" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass("aspect-video");

    const img = screen.getByRole("img");
    expect(img).toHaveClass("opacity-0");
    fireEvent.load(img);
    expect(img).toHaveClass("opacity-100");
  });

  it("fades in a cached image whose load event fired before onLoad bound", () => {
    // A cached image can reach `complete` before React attaches onLoad, so the
    // `load` event never reaches the handler. The ref callback must reconcile
    // from `img.complete` on mount, otherwise the <img> stays at opacity-0 over
    // the black wrapper and reads as a missing-art void.
    const proto = window.HTMLImageElement.prototype;
    const completeSpy = vi
      .spyOn(proto, "complete", "get")
      .mockReturnValue(true);
    const naturalWidthSpy = vi
      .spyOn(proto, "naturalWidth", "get")
      .mockReturnValue(1280);
    try {
      render(<ArtworkImage src="https://example.com/cached.jpg" alt="Cached" />);
      const img = screen.getByRole("img", { name: "Cached" });
      // No load event is dispatched — the fix must engage purely from `complete`.
      expect(img).toHaveClass("opacity-100");
      expect(img).not.toHaveClass("opacity-0");
    } finally {
      completeSpy.mockRestore();
      naturalWidthSpy.mockRestore();
    }
  });

  it("falls back to the placeholder for a cached-but-broken image (complete, naturalWidth 0)", () => {
    const proto = window.HTMLImageElement.prototype;
    const completeSpy = vi
      .spyOn(proto, "complete", "get")
      .mockReturnValue(true);
    const naturalWidthSpy = vi
      .spyOn(proto, "naturalWidth", "get")
      .mockReturnValue(0);
    try {
      render(<ArtworkImage src="https://example.com/broken-cached.jpg" alt="Broken cached" />);
      const placeholder = screen.getByTestId("artwork-placeholder");
      expect(placeholder).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Broken cached" })).toBe(placeholder);
    } finally {
      completeSpy.mockRestore();
      naturalWidthSpy.mockRestore();
    }
  });

  it("lazy-loads without a fetchpriority hint by default (below the fold)", () => {
    render(<ArtworkImage src="https://example.com/a.jpg" alt="Default" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).not.toHaveAttribute("fetchpriority");
  });

  it("eager-loads with fetchpriority=high when priority is set (LCP image)", () => {
    render(<ArtworkImage src="https://example.com/a.jpg" alt="Hero" priority />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
  });

  it("renders a scrim only when enabled and the image is present", () => {
    const { container, rerender } = render(
      <ArtworkImage src="https://example.com/a.jpg" alt="With scrim" scrim />,
    );
    // wrapper + img + scrim
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBe(1);

    rerender(<ArtworkImage src={undefined} alt="No image" scrim />);
    // placeholder is aria-hidden but no scrim over a placeholder
    expect(screen.getByTestId("artwork-placeholder")).toBeInTheDocument();
  });
});

describe("AmbientGlow", () => {
  it("renders children", () => {
    render(
      <AmbientGlow src="https://example.com/a.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders an aria-hidden, non-interactive blurred glow copy without backdrop-filter", () => {
    const { container } = render(
      <AmbientGlow src="https://example.com/a.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    const glow = container.querySelector("img") as HTMLImageElement;
    expect(glow).toBeInTheDocument();
    expect(glow).toHaveAttribute("aria-hidden", "true");
    expect(glow).toHaveClass("pointer-events-none");
    expect(glow).toHaveClass("blur-md");
    // No backdrop-filter usage (Android WebView compositing budget).
    expect(glow.className).not.toContain("backdrop");
  });

  it("blurs a small scaled-down copy (not the full-res image) for cheap compositing", () => {
    const { container } = render(
      <AmbientGlow src="https://example.com/a.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    const scaledBox = img.parentElement as HTMLElement;
    // The img lives inside a 10%-size box that is scaled back up, so only the
    // tiny rasterised copy is blurred.
    expect(scaledBox).toHaveClass("w-[10%]");
    expect(scaledBox).toHaveClass("h-[10%]");
    expect(scaledBox).toHaveClass("scale-[10.5]");
  });

  it("promotes the scaled box to its own composited layer (Blink/Android rasterises at pre-scale size)", () => {
    const { container } = render(
      <AmbientGlow src="https://example.com/a.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    const scaledBox = img.parentElement as HTMLElement;
    // transform-gpu (→ translateZ(0)) forces a composited layer so Blink
    // rasterises the blur at the small pre-scale size, not the displayed scaled-up
    // size (where it would decode the full-res source bitmap).
    expect(scaledBox).toHaveClass("transform-gpu");
    // No will-change: the glow never animates, so a permanent composited layer
    // would only cost Android WebView memory. transform-gpu alone promotes it.
    expect(scaledBox).not.toHaveClass("will-change-transform");
    // contain walls the decorative layer off from the rest of the subtree.
    expect(scaledBox.style.contain).toBe("layout paint");
  });

  it("prefers srcSmall over src for the glow copy (thumbnail-source contract)", () => {
    const { container } = render(
      <AmbientGlow
        src="https://example.com/full-res.jpg"
        srcSmall="https://example.com/thumb.jpg"
        width={320}
      >
        <span>content</span>
      </AmbientGlow>,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "https://example.com/thumb.jpg");
    expect(img).toHaveAttribute("width", "320");
  });

  it("falls back to src when no srcSmall is supplied", () => {
    const { container } = render(
      <AmbientGlow src="https://example.com/a.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "https://example.com/a.jpg");
  });

  it("renders the glow from srcSmall even when src is absent", () => {
    const { container } = render(
      <AmbientGlow srcSmall="https://example.com/thumb.jpg">
        <span>content</span>
      </AmbientGlow>,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "https://example.com/thumb.jpg");
  });

  it("renders no glow layer when src is absent", () => {
    const { container } = render(
      <AmbientGlow>
        <span>content</span>
      </AmbientGlow>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
