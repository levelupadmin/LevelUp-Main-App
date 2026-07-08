// tap-audit — static ≥44px touch-target floor check (P5-T3).
//
// Playwright-free, dependency-free (Node stdlib only) so it runs in CI without a
// booted dev server or auth session. It scans the hand-rolled interactive
// controls (`<button>`, `<a>`, `<Link>`) on the student-surface files the 44px
// sweep touches and fails if any carries an explicit sub-44 sizing token
// (`h-6`…`h-10`, `min-h-[28/36/40px]`, …) WITHOUT a compensating ≥44 hit area.
//
// The rule mirrors the sweep's doctrine: expand the HIT AREA, never the glyph —
// so a visually-28px chip passes when it centres a 44×44 `after:` overlay, and a
// full-width row passes on padding (no fixed-height token to flag). The shadcn
// `<Button>` primitive is governed centrally in ui/button.tsx and is out of this
// lens; those controls are height-checked at their call sites when overridden.
//
//   node scripts/qa/tap-audit.mjs            # audit, exit 1 on any violation
//   node scripts/qa/tap-audit.mjs --write    # also refresh scripts/qa/tap-audit.out.txt
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Student-surface files carrying hand-rolled controls the 44px floor covers.
const FILES = [
  "src/components/layout/StudentLayout.tsx",
  "src/components/FloatingSupport.tsx",
  "src/components/NotificationDropdown.tsx",
  "src/pages/CourseDetail.tsx",
  "src/components/chapter/ChapterNotes.tsx",
  "src/components/chapter/ResumePill.tsx",
  "src/components/certificates/CertificateGallery.tsx",
  "src/pages/ChapterViewer.tsx",
  "src/components/InitialsAvatar.tsx",
];

// A control clears the floor if its class list carries any of these. `after:h-11`
// / `after:min-h-[44px]` count because they are the centred 44×44 overlay pattern
// the sweep uses to keep a small glyph while lifting the tap area.
const OK = [
  /min-h-\[(?:4[4-9]|[5-9]\d|\d{3,})px\]/, // min-h-[44px] and up
  /min-w-\[(?:4[4-9]|[5-9]\d|\d{3,})px\]/,
  /\bmin-h-16\b/,
  /\bh-1[1-9]\b/, // h-11 … h-19
  /\bh-(?:2\d|1[1-9])\b/, // h-11+/h-20+ (Tailwind h-11=44px, h-12=48, h-14=56, h-16=64) — NOT h-10 (40px, sub-floor)
  /after:h-11\b/,
  /after:min-h-\[44px\]/,
];

// Explicit sub-44 sizing tokens that need a compensating hit area.
const SMALL = [
  /\bh-(?:[6-9]|10)\b/, // h-6(24) … h-10(40)
  /\bw-(?:[6-9]|10)\b/,
  /min-h-\[(?:[12]\d|3\d|40)px\]/, // min-h-[10px]…min-h-[40px]
  /min-w-\[(?:[12]\d|3\d|40)px\]/,
];

// Documented exceptions: <file>::<substring-of-class> that are intentionally
// exempt (non-tap decoration living on an interactive element, etc.). Empty
// today — every flagged control was lifted to a real 44px hit area.
const EXCEPTIONS = [];

const clsRe =
  /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\}|\{([^}]*)\})/;

function extractControls(src) {
  const lines = src.split("\n");
  const controls = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/<(?:button|a|Link)(?:[\s>/]|$)/.test(lines[i])) continue;
    // Gather the opening-tag region (attributes sit within a handful of lines).
    let block = "";
    for (let j = i; j < Math.min(i + 16, lines.length); j++) {
      block += lines[j] + "\n";
      if (/>\s*$/.test(lines[j]) || /\/>\s*$/.test(lines[j])) break;
    }
    const m = block.match(clsRe);
    const classes = m ? (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "") : "";
    controls.push({ line: i + 1, classes });
  }
  return controls;
}

let violations = 0;
const report = [];
report.push("tap-audit — ≥44px touch-target floor (student surfaces)");
report.push("=".repeat(56));

for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const controls = extractControls(src);
  const bad = [];
  for (const c of controls) {
    const small = SMALL.some((r) => r.test(c.classes));
    const ok = OK.some((r) => r.test(c.classes));
    if (small && !ok) {
      const exempt = EXCEPTIONS.some(
        (e) => e.startsWith(rel + "::") && c.classes.includes(e.split("::")[1])
      );
      if (!exempt) bad.push(c);
    }
  }
  violations += bad.length;
  report.push(
    `${bad.length === 0 ? "PASS" : "FAIL"}  ${rel}  (${controls.length} controls)`
  );
  for (const c of bad) {
    report.push(`      L${c.line}: sub-44 target — "${c.classes.trim().slice(0, 90)}"`);
  }
}

report.push("=".repeat(56));
report.push(
  violations === 0
    ? `OK — every hand-rolled control clears the 44px floor across ${FILES.length} files.`
    : `${violations} violation(s) — hit areas below 44px.`
);

const out = report.join("\n") + "\n";
process.stdout.write(out);

if (process.argv.includes("--write")) {
  writeFileSync(join(ROOT, "scripts/qa/tap-audit.out.txt"), out);
}

process.exit(violations === 0 ? 0 : 1);
