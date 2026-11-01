// Tailwind additions for Stage. MERGE into tailwind.config.ts `theme.extend`.
// Do not replace the file: every existing key stays, these entries are added
// or changed. Everything reads a CSS variable, so the old look returns when
// data-brand="stage" is removed (tokens/stage.css sets flag-off defaults).

export const stageExtend = {
  fontFamily: {
    // CHANGED: were hard-coded "Inter" / "JetBrains Mono". Now variables.
    display: ["var(--font-display)"],
    body: ["var(--font-body)"],
    mono: ["var(--font-mono)"],
    // serif stays defined for the flag-off look; Stage never uses it.
  },
  colors: {
    // NEW brand accent (Ember or Mono). Never use shadcn `accent` for this:
    // in this codebase `accent` is the neutral hover fill.
    brand: {
      DEFAULT: "hsl(var(--brand))",
      foreground: "hsl(var(--brand-foreground))",
      text: "hsl(var(--brand-text))", // accent-coloured type on the page (links, "Cohort room")
      line: "hsl(var(--brand-line))", // progress bars, switches, dots, the selected ring
    },
    live: {
      DEFAULT: "hsl(var(--live))",
      foreground: "hsl(var(--live-foreground))",
      text: "hsl(var(--live-text))",
    },
    "success-text": "hsl(var(--success-text))",
    warning: {
      DEFAULT: "hsl(var(--warning))", // bars, dots
      text: "hsl(var(--warning-text))", // "Due tomorrow" as text
    },
    line: {
      DEFAULT: "hsl(var(--border))", // hairlines (same value as `border`)
      strong: "hsl(var(--border-hover))", // input edges, sheet grabber
    },
    "surface-3": "hsl(var(--surface-3))",
    subtle: "hsl(var(--subtle-foreground))", // text-3: hints, eyebrows, timestamps
  },
  borderRadius: {
    // CHANGED: were fixed px. Stage values in stage.css; old values are the
    // flag-off defaults, so nothing moves while the flag is off.
    sm: "var(--r-xs)", // 8 (was 6)
    md: "var(--r-sm)", // 12 (was 10)
    lg: "var(--r-md)", // 16 (was 14)
    xl: "var(--r-lg)", // 22 (was 20)
    "2xl": "var(--r-xl)", // 28 (unchanged)
    // 3xl (36) unchanged
    card: "var(--r-lg)", // NEW semantic alias: cards and sheets
    button: "var(--r-md)", // NEW semantic alias: buttons and inputs
  },
  fontSize: {
    // NEW named steps from the Stage scale (px). The existing xs..3xl stay.
    "stage-display": ["38px", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
    "stage-h1": ["30px", { lineHeight: "1.06", letterSpacing: "-0.035em" }],
    "stage-h2": ["22px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
    "stage-h3": ["17px", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
    "stage-body": ["15px", { lineHeight: "1.45" }],
    "stage-small": ["13px", { lineHeight: "1.4" }],
    "stage-micro": ["11px", { lineHeight: "1.3", letterSpacing: "0.1em" }],
    "stage-count": ["56px", { lineHeight: "0.9", letterSpacing: "-0.03em" }],
  },
} as const;
