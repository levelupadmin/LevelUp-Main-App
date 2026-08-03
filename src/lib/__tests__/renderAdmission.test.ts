import { describe, it, expect } from "vitest";
import {
  ARTIFACT_BUDGET_MS,
  ARTIFACT_BUDGET_POLL_MS,
  ARTIFACT_CAPTURE_DEFER_MS,
  ARTIFACT_CAPTURE_IDLE_TIMEOUT_MS,
  ARTIFACT_CAPTURE_SLACK_MS,
  ARTIFACT_CLIP_MS,
  ARTIFACT_COPY,
  ARTIFACT_HEIGHT,
  ARTIFACT_HOLD_MS,
  ARTIFACT_MIME_CANDIDATES,
  ARTIFACT_SAFE_INSET,
  ARTIFACT_WIDTH,
  GLYPH_RATIO,
  REVEAL_SETTLED_MS,
  REVEAL_STAGES,
  admissionFileName,
  admissionFrameAt,
  admissionShareText,
  bezierEase,
  buildMetaLine,
  canRenderArtifact,
  captureDimensions,
  describeDelivery,
  ellipsizeToWidth,
  estimateTextWidth,
  fitFontSize,
  layoutAdmissionCard,
  orderShareAssets,
  pickCaptureProfile,
  pickRecorderMimeType,
  planDelivery,
  resolveArtifactPalette,
  sanitizeField,
  slugify,
  withinBudget,
  wrapToWidth,
  type AdmissionFields,
  type AdmissionLayout,
  type DeliveryCapabilities,
  type DeliveryMethod,
  type TextBlock,
} from "@/lib/artifact/renderAdmission";

/**
 * The pure half of the shareable admission artifact (REQ-DEC-3). These guard the
 * three things that, if they silently change, either break the card or break a
 * promise we made the applicant:
 *  1. it renders for an admitted applicant and NOBODY else,
 *  2. it is personalised from structured fields ONLY (NFR-COPY-1),
 *  3. the composition stays inside the frame at every input length.
 */

const FIELDS: AdmissionFields = {
  name: "Rahul Srinivas",
  cohort: "Creator Academy · Batch 04",
  craft: "Filmmaking",
  city: "Chennai",
};

/** Every string the layout would actually paint. */
const paintedLines = (layout: AdmissionLayout): string[] =>
  ([layout.eyebrow, layout.headline, layout.name, layout.cohort, layout.meta] as (TextBlock | null)[])
    .filter((block): block is TextBlock => block !== null)
    .flatMap((block) => block.lines);

describe("canRenderArtifact — who may ever see this", () => {
  it("renders for an admitted applicant with the flag on", () => {
    expect(canRenderArtifact({ verdict: "accepted", flagEnabled: true })).toBe(true);
  });
  it("never renders for a rejected verdict, flag on or off", () => {
    expect(canRenderArtifact({ verdict: "rejected", flagEnabled: true })).toBe(false);
    expect(canRenderArtifact({ verdict: "rejected", flagEnabled: false })).toBe(false);
  });
  it("never renders while the decision is still pending or unknown", () => {
    expect(canRenderArtifact({ verdict: "pending", flagEnabled: true })).toBe(false);
    expect(canRenderArtifact({ verdict: "", flagEnabled: true })).toBe(false);
    expect(canRenderArtifact({ verdict: null, flagEnabled: true })).toBe(false);
    expect(canRenderArtifact({ verdict: undefined, flagEnabled: true })).toBe(false);
  });
  it("stays dark when the flag is off even for an admitted applicant", () => {
    expect(canRenderArtifact({ verdict: "accepted", flagEnabled: false })).toBe(false);
  });
  it("tolerates the casing/padding a status column may carry", () => {
    expect(canRenderArtifact({ verdict: " Accepted ", flagEnabled: true })).toBe(true);
  });
});

describe("sanitizeField", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeField("  Rahul   Srinivas \n")).toBe("Rahul Srinivas");
  });
  it("strips control characters that would draw as tofu", () => {
    expect(sanitizeField("Rahul\u0007\u0000Srinivas")).toBe("Rahul Srinivas");
  });
  it("hard-caps a pathological value before layout ever sees it", () => {
    expect(sanitizeField("x".repeat(500)).length).toBe(80);
    expect(sanitizeField("x".repeat(500), 12).length).toBe(12);
  });
  it("treats an absent field as empty", () => {
    expect(sanitizeField(null)).toBe("");
    expect(sanitizeField(undefined)).toBe("");
  });
});

describe("buildMetaLine — craft · city", () => {
  it("joins both, upper-cased", () => {
    expect(buildMetaLine({ craft: "Filmmaking", city: "Chennai" })).toBe("FILMMAKING · CHENNAI");
  });
  it("drops a missing side without leaving a dangling separator", () => {
    expect(buildMetaLine({ craft: "Filmmaking", city: null })).toBe("FILMMAKING");
    expect(buildMetaLine({ craft: "", city: "Chennai" })).toBe("CHENNAI");
  });
  it("is empty when neither structured field is present", () => {
    expect(buildMetaLine({ craft: null, city: undefined })).toBe("");
  });

  it("drops a craft that is only the cohort again", () => {
    // `useDecision` defines craft as `occupation || cohort`, so a blank
    // occupation — or one the Tally fuzzy match missed — arrives here as the
    // cohort title verbatim. Printing it stacks the cohort line and an
    // upper-cased echo of the same words directly beneath it.
    expect(
      buildMetaLine({
        craft: "Creator Academy · Batch 04",
        city: "Chennai",
        cohort: "Creator Academy · Batch 04",
      }),
    ).toBe("CHENNAI");
  });

  it("compares craft against cohort past the display cap and casing", () => {
    const cohort = "Creator Academy Batch 04 Chennai Residency Track";
    expect(buildMetaLine({ craft: cohort.toLowerCase(), city: "Chennai", cohort })).toBe("CHENNAI");
  });

  it("keeps a craft that merely resembles the cohort", () => {
    expect(
      buildMetaLine({ craft: "Film", city: null, cohort: "Filmmaking Batch 04" }),
    ).toBe("FILM");
  });

  it("collapses to nothing when the echo was the only meta content", () => {
    expect(buildMetaLine({ craft: "Creator Academy", city: null, cohort: "Creator Academy" })).toBe(
      "",
    );
  });
});

describe("NFR-COPY-1 — the card carries structured fields and nothing else", () => {
  it("paints only the four structured fields plus the artifact's own copy", () => {
    const lines = paintedLines(layoutAdmissionCard(FIELDS));
    const allowed = [
      ARTIFACT_COPY.eyebrow,
      ARTIFACT_COPY.headline,
      FIELDS.name,
      FIELDS.cohort,
      buildMetaLine(FIELDS),
    ];
    lines.forEach((line) => {
      expect(allowed.some((candidate) => candidate.includes(line) || line.includes(candidate))).toBe(
        true,
      );
    });
  });

  it("ignores any extra property smuggled onto the input object", () => {
    const smuggled = {
      ...FIELDS,
      answer: "Filmmaking found me at fifteen and never let go, and here is exactly why.",
    } as AdmissionFields;
    const painted = paintedLines(layoutAdmissionCard(smuggled)).join(" ");
    expect(painted).not.toContain("fifteen");
    expect(painted).not.toContain("never let go");
  });

  it("keeps the share text to the cohort label", () => {
    expect(admissionShareText(FIELDS)).toContain(FIELDS.cohort);
    expect(admissionShareText({ cohort: "" })).toBe("I'm in. LevelUp.");
  });
});

describe("text measurement", () => {
  it("estimates width from length, size and tracking", () => {
    expect(estimateTextWidth("abcd", { fontPx: 100, ratio: 0.5 })).toBe(200);
    expect(estimateTextWidth("abcd", { fontPx: 100, ratio: 0.5, trackingEm: 0.25 })).toBe(300);
  });

  it("fits a long string down toward the floor and a short one at the ceiling", () => {
    const opts = { maxWidth: 800, maxFontPx: 100, minFontPx: 20, ratio: 0.5 };
    expect(fitFontSize("ab", opts)).toBe(100);
    expect(fitFontSize("x".repeat(200), opts)).toBe(20);
  });

  it("never returns a size that overflows when one is available", () => {
    const opts = { maxWidth: 800, maxFontPx: 100, minFontPx: 10, ratio: 0.5 };
    const text = "x".repeat(40);
    const size = fitFontSize(text, opts);
    expect(estimateTextWidth(text, { fontPx: size, ratio: 0.5 })).toBeLessThanOrEqual(800);
  });

  it("falls back to the ceiling for an empty string", () => {
    expect(fitFontSize("", { maxWidth: 800, maxFontPx: 64, minFontPx: 20, ratio: 0.5 })).toBe(64);
  });
});

describe("ellipsizeToWidth", () => {
  const metrics = { fontPx: 10, ratio: 1, maxWidth: 100 };
  it("passes a fitting string through untouched", () => {
    expect(ellipsizeToWidth("short", metrics)).toBe("short");
  });
  it("trims and marks an overflowing string", () => {
    const out = ellipsizeToWidth("x".repeat(50), metrics);
    expect(out.endsWith("…")).toBe(true);
    expect(estimateTextWidth(out, metrics)).toBeLessThanOrEqual(metrics.maxWidth);
  });
});

describe("wrapToWidth", () => {
  const metrics = { fontPx: 10, ratio: 1, maxWidth: 100 };
  it("wraps on word boundaries", () => {
    expect(wrapToWidth("aaaa bbbb cccc dddd", { ...metrics, maxLines: 4 })).toEqual([
      "aaaa bbbb",
      "cccc dddd",
    ]);
  });
  it("absorbs the remainder into the last line and ellipsizes it", () => {
    const lines = wrapToWidth("aaaa bbbb cccc dddd eeee", { ...metrics, maxLines: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
  it("returns nothing for an empty string", () => {
    expect(wrapToWidth("   ", { ...metrics, maxLines: 2 })).toEqual([]);
  });

  it("honours a one-line budget by absorbing and ellipsizing, never truncating", () => {
    const lines = wrapToWidth("aaaa bbbb cccc", { ...metrics, maxLines: 1 });
    expect(lines).toHaveLength(1);
    // The remainder is folded into the single line and MARKED as trimmed. The
    // failure this guards is the silent one: returning "aaaa" with no ellipsis
    // because the line budget was checked after the push instead of before it.
    expect(lines[0].startsWith("aaaa")).toBe(true);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(estimateTextWidth(lines[0], metrics)).toBeLessThanOrEqual(metrics.maxWidth);
  });

  it("never exceeds the line budget at any width", () => {
    for (const maxLines of [1, 2, 3]) {
      const lines = wrapToWidth("aaaa bbbb cccc dddd eeee ffff", { ...metrics, maxLines });
      expect(lines.length).toBeLessThanOrEqual(maxLines);
      expect(lines.length).toBeGreaterThan(0);
    }
  });
});

describe("layoutAdmissionCard", () => {
  it("composes on the 1080×1350 portrait frame", () => {
    const layout = layoutAdmissionCard(FIELDS);
    expect(layout.width).toBe(ARTIFACT_WIDTH);
    expect(layout.height).toBe(ARTIFACT_HEIGHT);
  });

  it("stacks the composition in reading order", () => {
    const layout = layoutAdmissionCard(FIELDS);
    expect(layout.name).not.toBeNull();
    expect(layout.cohort).not.toBeNull();
    expect(layout.meta).not.toBeNull();
    const order = [
      layout.eyebrow.firstBaseline,
      layout.headline.firstBaseline,
      layout.name!.firstBaseline,
      layout.rule.y,
      layout.cohort!.firstBaseline,
      layout.meta!.firstBaseline,
      layout.wordmark.markBaseline,
      layout.wordmark.subBaseline,
    ];
    order.forEach((value, i) => {
      if (i > 0) expect(value).toBeGreaterThan(order[i - 1]);
    });
  });

  it("keeps every baseline inside the frame", () => {
    const layout = layoutAdmissionCard(FIELDS);
    paintedLines(layout).forEach((line) => expect(line.length).toBeGreaterThan(0));
    const blocks = [layout.eyebrow, layout.headline, layout.name, layout.cohort, layout.meta];
    blocks.forEach((block) => {
      if (!block) return;
      const last = block.firstBaseline + (block.lines.length - 1) * block.lineHeightPx;
      expect(block.firstBaseline).toBeGreaterThan(0);
      expect(last).toBeLessThan(ARTIFACT_HEIGHT);
    });
    expect(layout.wordmark.subBaseline).toBeLessThan(ARTIFACT_HEIGHT);
  });

  it("keeps every line inside the safe inset at its fitted size", () => {
    const layout = layoutAdmissionCard({
      name: "Ramanathapuram Venkataramanan Subramanian",
      cohort: "Creator Academy · Batch 04 · Chennai Residency Track",
      craft: "Documentary Filmmaking",
      city: "Thiruvananthapuram",
    });
    const maxWidth = ARTIFACT_WIDTH - ARTIFACT_SAFE_INSET * 2;
    const check = (block: TextBlock | null, ratio: number) => {
      if (!block) return;
      block.lines.forEach((line) => {
        expect(
          estimateTextWidth(line, {
            fontPx: block.fontPx,
            ratio,
            trackingEm: block.trackingEm,
          }),
        ).toBeLessThanOrEqual(maxWidth);
      });
    };
    check(layout.eyebrow, GLYPH_RATIO.mono);
    check(layout.headline, GLYPH_RATIO.serif);
    check(layout.name, GLYPH_RATIO.sans);
    check(layout.cohort, GLYPH_RATIO.serif);
    check(layout.meta, GLYPH_RATIO.mono);
  });

  it("drops the name block rather than painting an empty line", () => {
    const layout = layoutAdmissionCard({ ...FIELDS, name: "   " });
    expect(layout.name).toBeNull();
  });

  it("drops the meta line when neither craft nor city is known", () => {
    const layout = layoutAdmissionCard({ ...FIELDS, craft: null, city: null });
    expect(layout.meta).toBeNull();
  });

  it("re-centres the group when the composition gets shorter", () => {
    const full = layoutAdmissionCard(FIELDS);
    const sparse = layoutAdmissionCard({ name: "", cohort: FIELDS.cohort, craft: null, city: null });
    expect(sparse.eyebrow.firstBaseline).toBeGreaterThan(full.eyebrow.firstBaseline);
  });

  it("wraps a name only once it has hit the minimum size", () => {
    const layout = layoutAdmissionCard({ ...FIELDS, name: "Rahul Srinivas" });
    expect(layout.name!.lines).toEqual(["Rahul Srinivas"]);
  });

  it("never prints the cohort twice when occupation was blank", () => {
    // The exact shape `useDecision` produces for a null occupation: craft falls
    // back to the offering title, so the card would otherwise carry the cohort
    // line AND an upper-cased repeat of it in the meta line.
    const cohort = "Creator Academy · Batch 04";
    const layout = layoutAdmissionCard({
      name: "Rahul Srinivas",
      cohort,
      craft: cohort,
      city: "Chennai",
    });
    expect(layout.cohort!.lines).toEqual([cohort]);
    expect(layout.meta!.lines).toEqual(["CHENNAI"]);
  });

  it("drops the meta line entirely when the echoed craft was all it had", () => {
    const cohort = "Creator Academy · Batch 04";
    const layout = layoutAdmissionCard({ name: "Rahul Srinivas", cohort, craft: cohort, city: null });
    expect(layout.cohort!.lines).toEqual([cohort]);
    expect(layout.meta).toBeNull();
  });
});

describe("resolveArtifactPalette", () => {
  it("uses the live token values", () => {
    const palette = resolveArtifactPalette((token) =>
      token === "--cream" ? " 40 60% 87% " : undefined,
    );
    expect(palette.cream).toBe("hsl(40 60% 87%)");
  });
  it("falls back to the brand tokens when the stylesheet has not resolved", () => {
    const palette = resolveArtifactPalette(() => "");
    expect(palette.field).toBe("hsl(0 0% 0%)");
    expect(palette.foreground).toBe("hsl(40 30% 96%)");
    expect(palette.muted).toBe("hsl(240 3% 66%)");
  });
});

describe("bezierEase", () => {
  it("pins both ends", () => {
    expect(bezierEase(0)).toBe(0);
    expect(bezierEase(1)).toBe(1);
    expect(bezierEase(-2)).toBe(0);
    expect(bezierEase(4)).toBe(1);
  });
  it("is monotonically increasing across the curve", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const value = bezierEase(i / 20);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
  it("front-loads the motion, as an ease-out curve must", () => {
    expect(bezierEase(0.5)).toBeGreaterThan(0.5);
  });
});

describe("admissionFrameAt — the reveal timeline", () => {
  it("opens on nothing", () => {
    const frame = admissionFrameAt(0);
    expect(frame.headline.opacity).toBe(0);
    expect(frame.name.opacity).toBe(0);
    expect(frame.wordmark.opacity).toBe(0);
  });

  it("settles every element by the end of the clip", () => {
    const frame = admissionFrameAt(ARTIFACT_CLIP_MS);
    Object.values(frame).forEach((state) => {
      expect(state.opacity).toBe(1);
      expect(state.translateY).toBe(0);
    });
  });

  it("derives the still's paint time from the choreography, not a literal", () => {
    // The PNG floor is painted at REVEAL_SETTLED_MS, so this is the guard that a
    // re-timed beat cannot freeze the still mid-reveal.
    expect(REVEAL_SETTLED_MS).toBeLessThanOrEqual(ARTIFACT_CLIP_MS);
    Object.values(admissionFrameAt(REVEAL_SETTLED_MS)).forEach((state) => {
      expect(state.opacity).toBe(1);
      expect(state.translateY).toBe(0);
    });
    const justBefore = admissionFrameAt(REVEAL_SETTLED_MS - 1);
    expect(Object.values(justBefore).some((state) => state.opacity < 1)).toBe(true);
  });

  it("never runs past the 2.6s reveal budget", () => {
    Object.values(REVEAL_STAGES).forEach((stage) => {
      expect(stage.startMs + stage.durationMs).toBeLessThanOrEqual(ARTIFACT_CLIP_MS);
    });
  });

  it("staggers headline before name before meta", () => {
    const frame = admissionFrameAt(1200);
    expect(frame.headline.opacity).toBeGreaterThan(frame.name.opacity);
    expect(frame.name.opacity).toBeGreaterThan(frame.meta.opacity);
  });

  it("moves elements up into place and only up", () => {
    const frame = admissionFrameAt(700);
    expect(frame.headline.translateY).toBeGreaterThan(0);
    expect(frame.headline.translateY).toBeLessThanOrEqual(REVEAL_STAGES.headline.risePx);
  });

  it("clamps opacity into range at every sampled instant", () => {
    for (let t = 0; t <= ARTIFACT_CLIP_MS; t += 50) {
      Object.values(admissionFrameAt(t)).forEach((state) => {
        expect(state.opacity).toBeGreaterThanOrEqual(0);
        expect(state.opacity).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe("capture budget", () => {
  it("stops encoding at the 60s post-accept budget", () => {
    expect(withinBudget(0)).toBe(true);
    expect(withinBudget(59_999)).toBe(true);
    expect(withinBudget(60_000)).toBe(false);
    expect(withinBudget(-1)).toBe(false);
  });

  it("gives the timer backstop room to trail the clip but stay inside the budget", () => {
    // The component stops the recorder from a setTimeout as well as the rAF
    // loop, because rAF is throttled to zero in a backgrounded WebView. The
    // backstop must fire AFTER a healthy clip would have finished on its own,
    // and the watchdog must poll often enough to catch the budget there too.
    expect(ARTIFACT_CAPTURE_SLACK_MS).toBeGreaterThan(0);
    expect(ARTIFACT_CLIP_MS + ARTIFACT_HOLD_MS + ARTIFACT_CAPTURE_SLACK_MS).toBeLessThan(
      ARTIFACT_BUDGET_MS,
    );
    expect(ARTIFACT_BUDGET_POLL_MS).toBeGreaterThan(0);
    expect(ARTIFACT_BUDGET_POLL_MS).toBeLessThanOrEqual(ARTIFACT_CLIP_MS);
  });

  it("leaves the deferred start inside the budget with room to spare", () => {
    // The clip yields to the celebration screen before it takes the thread, so
    // the worst-case wall clock is defer + idle timeout + clip + hold + slack.
    // The whole of it has to fit the 60s the brief promises, comfortably.
    const worstCase =
      ARTIFACT_CAPTURE_DEFER_MS +
      ARTIFACT_CAPTURE_IDLE_TIMEOUT_MS +
      ARTIFACT_CLIP_MS +
      ARTIFACT_HOLD_MS +
      ARTIFACT_CAPTURE_SLACK_MS;
    expect(ARTIFACT_CAPTURE_DEFER_MS).toBeGreaterThan(0);
    expect(worstCase).toBeLessThan(ARTIFACT_BUDGET_MS / 2);
  });
});

describe("pickCaptureProfile — what a device is allowed to spend on a clip", () => {
  it("runs a capable device at full size", () => {
    const profile = pickCaptureProfile({ hardwareConcurrency: 12, deviceMemory: 16 });
    expect(profile.scale).toBe(1);
    expect(profile.videoBitsPerSecond).toBeLessThanOrEqual(4_000_000);
  });

  it("backs a midrange phone off in size AND bitrate together", () => {
    const mid = pickCaptureProfile({ hardwareConcurrency: 8, deviceMemory: 4 });
    const top = pickCaptureProfile({ hardwareConcurrency: 12, deviceMemory: 16 });
    expect(mid.scale).toBeLessThan(top.scale);
    expect(mid.videoBitsPerSecond).toBeLessThan(top.videoBitsPerSecond);
  });

  it("takes the low tier for a low core count or a small memory report", () => {
    const byCores = pickCaptureProfile({ hardwareConcurrency: 4, deviceMemory: 8 });
    const byMemory = pickCaptureProfile({ hardwareConcurrency: 8, deviceMemory: 2 });
    expect(byCores.scale).toBe(0.5);
    expect(byMemory.scale).toBe(0.5);
    expect(byCores.fps).toBeLessThanOrEqual(24);
  });

  it("treats an unreporting runtime as midrange, not as a workstation", () => {
    // A runtime that admits neither core count nor memory is likelier an older
    // WebView than a desktop, so the unknown case must not buy the top tier.
    expect(pickCaptureProfile().scale).toBe(0.75);
    expect(pickCaptureProfile({}).scale).toBe(0.75);
  });

  it("never exceeds the desktop-era bitrate at any tier", () => {
    const hints = [
      { hardwareConcurrency: 2 },
      { hardwareConcurrency: 6 },
      { hardwareConcurrency: 16, deviceMemory: 32 },
    ];
    hints.forEach((hint) => {
      const profile = pickCaptureProfile(hint);
      expect(profile.videoBitsPerSecond).toBeLessThan(6_000_000);
      expect(profile.fps).toBeGreaterThan(0);
    });
  });
});

describe("captureDimensions", () => {
  it("keeps the 4:5 frame and both axes even for the encoder", () => {
    [1, 0.75, 0.5].forEach((scale) => {
      const { width, height } = captureDimensions({
        scale,
        videoBitsPerSecond: 1,
        fps: 30,
      });
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      expect(width / height).toBeCloseTo(ARTIFACT_WIDTH / ARTIFACT_HEIGHT, 2);
    });
  });

  it("renders the full frame at scale 1", () => {
    expect(captureDimensions({ scale: 1, videoBitsPerSecond: 1, fps: 30 })).toEqual({
      width: ARTIFACT_WIDTH,
      height: ARTIFACT_HEIGHT,
    });
  });
});

describe("orderShareAssets — the PNG is the floor, not the fallback", () => {
  interface Asset {
    kind: string;
  }
  const still: Asset = { kind: "still" };
  const clip: Asset = { kind: "clip" };

  it("hands the still to a share CTA even once the clip exists", () => {
    // The regression this guards: `clip ?? still` made the shared asset depend on
    // whether the ~3.5s encode had finished, so an early tap got a PNG and a late
    // tap got a WebM that Stories and LinkedIn both refuse.
    expect(orderShareAssets({ still, clip }, "still")).toEqual([still]);
    expect(orderShareAssets({ still, clip: null }, "still")).toEqual([still]);
  });

  it("prefers the clip only for the clip CTA, with the still behind it", () => {
    expect(orderShareAssets({ still, clip }, "clip")).toEqual([clip, still]);
  });

  it("never returns nothing while any asset exists", () => {
    expect(orderShareAssets({ still, clip: null }, "clip")).toEqual([still]);
    expect(orderShareAssets({ still: null, clip }, "clip")).toEqual([clip]);
    expect(orderShareAssets({ still: null, clip: null }, "still")).toEqual([]);
  });
});

describe("planDelivery — which mechanism can actually carry the artifact", () => {
  const caps = (over: Partial<DeliveryCapabilities> = {}): DeliveryCapabilities => ({
    canShareFiles: false,
    canDownload: false,
    canCopyImage: false,
    isImage: true,
    ...over,
  });

  it("prefers a file share, then a download, then the clipboard", () => {
    expect(
      planDelivery(caps({ canShareFiles: true, canDownload: true, canCopyImage: true })),
    ).toEqual(["share-file", "download", "clipboard-image"]);
  });

  it("keeps a clip off the clipboard — only a raster still can go there", () => {
    expect(planDelivery(caps({ canCopyImage: true, isImage: false }))).toEqual([]);
    expect(planDelivery(caps({ canCopyImage: true, isImage: true }))).toEqual(["clipboard-image"]);
  });

  it("describes desktop web: no file share, but a real download", () => {
    expect(planDelivery(caps({ canDownload: true }))).toEqual(["download"]);
  });

  it("describes the iOS shell: WKWebView shares files, and cannot download", () => {
    expect(planDelivery(caps({ canShareFiles: true }))).toEqual(["share-file"]);
  });

  it("returns an EMPTY plan for the Android shell rather than a false success", () => {
    // Android System WebView implements no Web Share API, the Capacitor shell
    // registers no DownloadListener, and @capacitor/share carries file:// URLs
    // only — which needs @capacitor/filesystem, not a dependency here. An empty
    // plan is the honest answer; the caller must say so instead of opening a
    // sheet with the caption alone and reporting "shared".
    expect(planDelivery(caps())).toEqual([]);
  });

  it("still reaches the clipboard where the Android WebView offers it", () => {
    expect(planDelivery(caps({ canCopyImage: true }))).toEqual(["clipboard-image"]);
  });
});

describe("pickRecorderMimeType", () => {
  it("prefers vp8, then vp9, then the bare container", () => {
    // VP8 leads on purpose. Android System WebView answers true for VP9 while
    // having no hardware VP9 encoder, so preferring it hands a 3.5s decorative
    // clip to a realtime libvpx software encode on the thread that is painting
    // the celebration. Every surface that takes a WebM takes VP8.
    expect(pickRecorderMimeType(ARTIFACT_MIME_CANDIDATES, () => true)).toBe("video/webm;codecs=vp8");
    expect(
      pickRecorderMimeType(ARTIFACT_MIME_CANDIDATES, (type) => !type.includes("vp8")),
    ).toBe("video/webm;codecs=vp9");
  });

  it("returns null where the platform encodes no WebM at all — the PNG floor stands", () => {
    expect(pickRecorderMimeType(ARTIFACT_MIME_CANDIDATES, () => false)).toBeNull();
  });

  it("treats a probe that throws as unsupported rather than crashing the render", () => {
    expect(
      pickRecorderMimeType(ARTIFACT_MIME_CANDIDATES, () => {
        throw new Error("no recorder here");
      }),
    ).toBeNull();
  });
});

describe("describeDelivery — what the applicant is told happened", () => {
  const methods: DeliveryMethod[] = ["share-file", "download", "clipboard-image"];

  it("says nothing extra for a plain share — the OS sheet is its own receipt", () => {
    expect(describeDelivery({ method: "share-file", substituted: false })).toBeNull();
  });

  it("announces the substitution on EVERY mechanism, not just the share", () => {
    // The failure this guards: on a native shell "Share clip" finds no mechanism
    // for a WebM at all, falls through to the still and lands on the clipboard,
    // so a share-only notice is unreachable exactly where it is needed and the
    // applicant is told "Card copied" with no hint the clip never went.
    methods.forEach((method) => {
      const notice = describeDelivery({ method, substituted: true });
      expect(notice).not.toBeNull();
      expect(notice).toContain("clip");
      expect(notice!.toLowerCase()).toContain("still");
    });
  });

  it("describes the download as a click, never as a verified save", () => {
    // A programmatic anchor click is not an observable write, so the copy must
    // not promise one.
    const notice = describeDelivery({ method: "download", substituted: false });
    expect(notice).toBe("Downloading your card. Check your downloads.");
    expect(notice).not.toContain("Saved");
  });

  it("keeps the clipboard line actionable", () => {
    expect(describeDelivery({ method: "clipboard-image", substituted: false })).toBe(
      "Card copied. Paste it into your story.",
    );
  });

  it("uses no em dashes anywhere in the applicant-facing copy", () => {
    methods.forEach((method) => {
      [true, false].forEach((substituted) => {
        expect(describeDelivery({ method, substituted }) ?? "").not.toContain("—");
      });
    });
  });
});

describe("delivery naming", () => {
  it("slugifies a name for the file system", () => {
    expect(slugify("Rahul  Srinivas")).toBe("rahul-srinivas");
    expect(slugify("!!!")).toBe("");
  });
  it("names both artifacts, with a safe fallback", () => {
    expect(admissionFileName(FIELDS, "png")).toBe("levelup-admission-rahul-srinivas.png");
    expect(admissionFileName(FIELDS, "webm")).toBe("levelup-admission-rahul-srinivas.webm");
    expect(admissionFileName({ name: "   " }, "png")).toBe("levelup-admission.png");
  });
});
