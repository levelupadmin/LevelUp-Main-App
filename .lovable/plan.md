

# Replace Design System with DesignCode UI

## Overview
Full rebrand: swap fonts to Inter, adopt a light-first color palette with semantic tokens and dark mode support, implement DesignCode UI's spacing scale, shadow system, typography hierarchy, and button variants. Remove cinematic effects (film grain, vignette, Ken Burns).

## 1. Fonts and Typography

Replace Sora/Plus Jakarta Sans/JetBrains Mono with Inter.

**Typography scale** (from DesignCode UI):
- H1: 60px / Semibold / 120% line-height
- H2: 50px / Semibold
- H3: 40px / Semibold
- H4: 30px / Semibold
- H5: 24px / Semibold
- Headline: 20px / Regular
- Body Large: 18px / Regular
- Body: 16px / Regular
- Caption: 14px / Regular
- Footnote: 12px / Regular

**Files**: `src/index.css` (Google Fonts import), `tailwind.config.ts` (fontFamily)

## 2. Color System

Replace the monochrome dark-only palette with a semantic light-first system with dark mode toggle.

**Semantic tokens** (light mode defaults, dark mode overrides via `.dark` class):

| Token | Light | Dark |
|-------|-------|------|
| background | #FFFFFF | #1C1C1E |
| foreground | #1C1C1E | #F5F5F7 |
| card | #F5F5F7 | #2C2C2E |
| primary | #007AFF (blue-500) | #0A84FF |
| secondary | #F2F2F7 | #38383A |
| muted | #F2F2F7 | #38383A |
| border | #D1D1D6 | #38383A |
| destructive | #FF3B30 | #FF453A |
| accent | #007AFF | #0A84FF |

Add color scale primitives (blue, green, red, orange, purple, gray 50-900) as CSS custom properties.

**Files**: `src/index.css`, `tailwind.config.ts`

## 3. Spacing Scale (4-pt grid)

Add spacing tokens based on the 4-pt system:
- `--space-1`: 4px, `--space-2`: 8px, `--space-3`: 12px, `--space-4`: 16px, `--space-5`: 20px, `--space-6`: 24px, `--space-8`: 32px, `--space-10`: 40px, `--space-12`: 48px, `--space-16`: 64px

**Files**: `tailwind.config.ts` (extend spacing)

## 4. Shadow System

Replace current shadows with DesignCode UI's 3-tier system:

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.08);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.1);
```

Dark mode adds inner glow: `inset 0 1px 0 rgba(255,255,255,0.05)`.

**Files**: `src/index.css`, `tailwind.config.ts`

## 5. Button Variants

Update `button.tsx` with DesignCode UI styles:
- **Primary (Flat)**: Solid blue-500 background, white text
- **Secondary (Outline)**: Transparent with border, foreground text
- **Ghost**: No border, subtle hover background
- **Glass**: Backdrop-blur with semi-transparent background (new variant)
- Sizes: sm (32px), md (40px), lg (48px), xl (56px)
- Rounded corners: 12px default

**Files**: `src/components/ui/button.tsx`

## 6. Component Updates

Update base UI components to match the new tokens:
- **Card**: Light background, subtle border, shadow-sm
- **Input/Textarea**: Updated border colors, focus ring uses primary blue
- **Badge**: Updated to use new color scale
- **Dialog/Sheet**: Updated overlay opacity, content background

**Files**: Multiple files in `src/components/ui/`

## 7. Remove Cinematic Effects

Remove from `src/index.css`:
- Film grain `body::after` overlay
- Ambient vignette `body::before` overlay
- Ken Burns animation
- `.text-gradient-amber` and amber gradient tokens
- `.gradient-hero`, `.gradient-subtle` utilities

## 8. Dark Mode Toggle

Switch from always-dark to class-based dark mode. Add `darkMode: ["class"]` (already set). Default to light mode. The app will start in light mode; dark mode applies when `.dark` is on `<html>`.

**Files**: `src/index.css` (add `.dark` overrides), `index.html` (remove any dark class default)

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Full rewrite: Inter font, light/dark CSS vars, remove grain/vignette |
| `tailwind.config.ts` | Inter fontFamily, spacing scale, shadow tokens, color primitives |
| `src/components/ui/button.tsx` | New variants (glass, flat, outline), sizes, rounded corners |
| `src/components/ui/card.tsx` | Updated shadow and background classes |
| `src/components/ui/input.tsx` | Updated focus ring and border styling |
| `src/components/ui/textarea.tsx` | Same as input |
| `src/components/ui/badge.tsx` | Updated color variants |
| `src/components/ui/dialog.tsx` | Updated overlay and content styles |
| `src/components/ui/sheet.tsx` | Updated overlay and content styles |
| `index.html` | Remove dark default if set |
| `src/App.css` | Clean up unused styles |

This is a foundational design system swap. All existing pages will inherit the new tokens automatically through CSS variables. No page-level code changes are needed in this phase.

