import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        // Variables (design/stage/tokens/tailwind.stage.ts): src/styles/stage.css
        // sets them to Inter / JetBrains Mono with the Stage flag off, so the old
        // look holds, and to Bricolage Grotesque / Geist / Geist Mono with it on.
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        serif: ['"Instrument Serif"', 'serif'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.5' }],
        'base': ['16px', { lineHeight: '1.5' }],
        'lg': ['18px', { lineHeight: '1.5' }],
        'xl': ['24px', { lineHeight: '1.2' }],
        '2xl': ['32px', { lineHeight: '1.2' }],
        '3xl': ['48px', { lineHeight: '1.2' }],
        // Stage type scale (spec section 5)
        "stage-display": ["38px", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        "stage-h1": ["30px", { lineHeight: "1.06", letterSpacing: "-0.035em" }],
        "stage-h2": ["22px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "stage-h3": ["17px", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "stage-body": ["15px", { lineHeight: "1.45" }],
        "stage-small": ["13px", { lineHeight: "1.4" }],
        "stage-micro": ["11px", { lineHeight: "1.3", letterSpacing: "0.1em" }],
        "stage-count": ["56px", { lineHeight: "0.9", letterSpacing: "-0.03em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-hover": "hsl(var(--border-hover))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        canvas: "hsl(var(--canvas))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        cream: {
          DEFAULT: "hsl(var(--cream))",
          text: "hsl(var(--cream-text))",
        },
        gold: "hsl(var(--gold))",
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        "avatar-blue": "hsl(var(--avatar-blue))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          text: "hsl(var(--destructive-text))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          crimson: "hsl(var(--accent-crimson))",
          "crimson-text": "hsl(var(--accent-crimson-text))",
          indigo: "hsl(var(--accent-indigo))",
          "indigo-text": "hsl(var(--accent-indigo-text))",
          emerald: "hsl(var(--accent-emerald))",
          amber: "hsl(var(--accent-amber))",
          violet: "hsl(var(--accent-violet))",
          "violet-deep": "hsl(var(--accent-violet-deep))",
        },
        // The per-cohort room accent, same two-token shape as the crimson/indigo
        // pairs above (fill + a small-text lightness). Flat rather than nested
        // under `accent` on purpose: Tailwind flattens nested groups with a dash,
        // so nesting would spell the utility `text-accent-room-accent` while the
        // room spec (design/briefs/cohort-r1.md R1-T2) is `text-room-accent`.
        // The vars default to cream on :root and are overridden per room by
        // RoomThemeProvider, so these resolve outside a room too.
        "room-accent": "hsl(var(--room-accent))",
        "room-accent-text": "hsl(var(--room-accent-text))",
        // Stage additions (design/stage/tokens/tailwind.stage.ts). `brand` is the
        // one accent (Ember or Mono); never shadcn `accent`, which is the neutral
        // hover fill here. Flag-off defaults live in src/styles/stage.css.
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          text: "hsl(var(--brand-text))",
          line: "hsl(var(--brand-line))",
        },
        live: {
          DEFAULT: "hsl(var(--live))",
          foreground: "hsl(var(--live-foreground))",
          text: "hsl(var(--live-text))",
        },
        "success-text": "hsl(var(--success-text))",
        warning: {
          DEFAULT: "hsl(var(--warning))",
          text: "hsl(var(--warning-text))",
        },
        line: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-hover))",
        },
        "surface-3": "hsl(var(--surface-3))",
        subtle: "hsl(var(--subtle-foreground))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        // Variables: the old 6/10/14/20/28 with the Stage flag off
        // (src/styles/stage.css :root), Stage's 8/12/16/22/28 with it on.
        sm: "var(--r-xs)",
        md: "var(--r-sm)",
        lg: "var(--r-md)",
        xl: "var(--r-lg)",
        "2xl": "var(--r-xl)",
        "3xl": "36px",
        card: "var(--r-lg)",
        button: "var(--r-md)",
      },
      spacing: {
        // Semantic spacing — use for page padding / section rhythm / tab-bar offset
        "page-y": "2rem",
        "page-y-sm": "1.5rem",
        "section": "2.5rem",
        "section-sm": "1.75rem",
        "stack": "1rem",
        "stack-sm": "0.75rem",
        "tab-bar": "4.5rem", // 56px mobile tab bar + 16px breathing room
        // iOS safe-area helpers available as classes below (safe-top, safe-bottom)
      },
      boxShadow: {
        // Soft elevation ladder tuned for a pure-black (#000) canvas. On black, a
        // drop shadow barely reads, so each rung pairs a low-alpha black shadow with
        // a hairline top light-edge (inset white) to give surfaces a lifted, glassy
        // separation without visibly darkening the page vs. Tailwind's old defaults.
        "design-sm": "0 1px 2px 0 hsl(0 0% 0% / 0.5), inset 0 1px 0 0 hsl(0 0% 100% / 0.04)",
        "design-md": "0 4px 12px -2px hsl(0 0% 0% / 0.55), inset 0 1px 0 0 hsl(0 0% 100% / 0.05)",
        "design-lg": "0 12px 32px -4px hsl(0 0% 0% / 0.6), inset 0 1px 0 0 hsl(0 0% 100% / 0.06)",
        // Champagne glows for CTAs / celebration moments, derived from the existing
        // --champagne-to and --gold HSL vars so they track the palette.
        "glow-cream": "0 0 24px -4px hsl(var(--champagne-to) / 0.45), 0 0 8px -2px hsl(var(--champagne-to) / 0.35)",
        "glow-gold": "0 0 24px -4px hsl(var(--gold) / 0.5), 0 0 8px -2px hsl(var(--gold) / 0.4)",
      },
      zIndex: {
        // Semantic z-index scale matching the app's existing stacking layers.
        // Provided as tokens only this phase — no existing components are renumbered.
        base: "1",
        sticky: "30",
        overlay: "40",
        modal: "50",
        toast: "60",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "in-out-smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        "fast": "160ms",
        "base": "240ms",
        "slow": "400ms",
        // Editorial "sweep" timing — mirrors durations.sweep (0.7s) in
        // src/lib/motion.ts. Longer than --motion-slow so a progress fill reads
        // as a deliberate sweep rather than a UI transition.
        "sweep": "700ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-progress": {
          from: { width: "0%" },
          to: { width: "100%" },
        },
        slideProgress: {
          from: { width: "0%" },
          to: { width: "100%" },
        },
        "heart-pop": {
          "0%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.35)" },
          "60%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "milestone-in": {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.9)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "milestone-out": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-10px) scale(0.95)" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "slide-left-in": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-left-out": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(-24px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-progress": "slide-progress 6s linear",
        "heart-pop": "heart-pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in-up": "fade-in-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "milestone-in": "milestone-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "milestone-out": "milestone-out 0.4s ease-in forwards",
        "shimmer": "shimmer 2s linear infinite",
        "slide-left-in": "slide-left-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "slide-left-out": "slide-left-out 200ms ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
