import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtworkImage } from "../ArtworkImage";
import { AmbientGlow } from "../AmbientGlow";

describe("ArtworkImage", () => {
  it("renders the branded placeholder when src is missing", () => {
    render(<ArtworkImage src={undefined} alt="Course art" />);
    expect(screen.getByTestId("artwork-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the branded placeholder when the image errors", () => {
    render(<ArtworkImage src="https://example.com/broken.jpg" alt="Broken" />);
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.getByTestId("artwork-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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
