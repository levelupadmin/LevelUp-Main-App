# Lighthouse audit — 2026-05-24

URL audited: `https://app.leveluplearning.in/p/lokesh-kanagaraj-teaches-film-making`

| Category | Score |
|---|---|
| Performance | 36/100 ❌ |
| Accessibility | 96/100 ✅ |
| Best Practices | 58/100 ⚠️ |
| SEO | 100/100 ✅ |

## Performance vitals

| Metric | Value | Score |
|---|---|---|
| First Contentful Paint | 4.6 s | 0.14 |
| Largest Contentful Paint | 10.3 s | 0.00 |
| Total Blocking Time | 160 ms | 0.94 |
| Cumulative Layout Shift | 0.943 | 0.03 |
| Speed Index | 5.5 s | 0.55 |

## Top opportunities

1. **Reduce unused JavaScript** — 283 KiB of dead bytes on this page
2. **Reduce unused CSS** — 17 KiB

## Likely CLS / LCP root causes

1. Hero image — large, no explicit width/height, lazy intersection observer probably waiting too long
2. Font swap reflow when Instrument_Serif loads (the brand italic font)
3. Async pixel scripts injecting late
4. WhatYoullLearn rail + Curriculum mounting after initial paint

## Triage priority (post-launch)

- **Critical**: explicit width/height on hero img, font preload, image format upgrade (AVIF/WebP)
- **Worth**: code-split offering page so unused JS doesn't ship
- **Nice**: defer Razorpay (already partly done, see PublicOffering refactor)
