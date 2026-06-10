import { Check, ShieldCheck } from "lucide-react";
import Reveal from "@/components/motion/Reveal";

/**
 * Parses the plain-text offering.description (paragraphs + "•"/"- "
 * bullets, the format admins paste into the editor) into structured
 * blocks so the page can render check-list card grids and a guarantee
 * callout instead of one grey wall of text.
 *
 * Rules:
 *  - consecutive bullet lines → a check-list card grid
 *  - a line ending with ":" immediately before a bullet group → that
 *    group's small uppercase mono heading
 *  - any paragraph mentioning "money-back" / "guarantee" → a distinct
 *    GuaranteeCard, rendered after the other blocks
 *  - everything else → normal prose paragraphs
 *  - defensive: if no bullets are found at all, fall back to the
 *    original single whitespace-pre-line paragraph
 */

type Block =
  | { type: "paragraph"; text: string }
  | { type: "list"; heading: string | null; items: string[] };

interface ParsedDescription {
  blocks: Block[];
  guarantees: string[];
  hasBullets: boolean;
}

const BULLET_RE = /^(?:•|-)\s+/;
const GUARANTEE_RE = /money-back|guarantee/i;

export function parseDescription(text: string): ParsedDescription {
  const blocks: Block[] = [];
  const guarantees: string[] = [];
  // Heading candidate (a "Something:" line) held until we know whether a
  // bullet group follows it. Stored raw so it can fall back to a normal
  // paragraph (colon intact) if no bullets arrive.
  let pendingHeading: string | null = null;
  let currentList: { heading: string | null; items: string[] } | null = null;

  const flushList = () => {
    if (currentList && currentList.items.length) blocks.push({ type: "list", ...currentList });
    currentList = null;
  };
  const flushHeading = () => {
    if (pendingHeading !== null) blocks.push({ type: "paragraph", text: pendingHeading });
    pendingHeading = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // Blank lines are soft separators, they keep a held heading or an
    // open bullet group alive (admins often blank-line between them).
    if (!line) continue;

    if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, "").trim();
      if (!currentList) {
        currentList = {
          heading: pendingHeading ? pendingHeading.replace(/:\s*$/, "") : null,
          items: [],
        };
        pendingHeading = null;
      }
      if (item) currentList.items.push(item);
      continue;
    }

    // Plain text line: close any open list, demote an unused heading.
    flushList();
    flushHeading();
    if (GUARANTEE_RE.test(line)) {
      guarantees.push(line);
    } else if (/:\s*$/.test(line)) {
      pendingHeading = line;
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  flushList();
  flushHeading();

  return {
    blocks,
    guarantees,
    hasBullets: blocks.some((b) => b.type === "list"),
  };
}

function GuaranteeCard({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent-emerald)/0.4)] bg-[hsl(var(--accent-emerald)/0.08)] p-4 sm:p-5">
      <ShieldCheck className="h-5 w-5 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
      <p className="text-sm sm:text-base text-foreground leading-relaxed">{text}</p>
    </div>
  );
}

interface DescriptionBlocksProps {
  description: string;
}

export default function DescriptionBlocks({ description }: DescriptionBlocksProps) {
  const { blocks, guarantees, hasBullets } = parseDescription(description);

  // No bullets found → render exactly as the page always did.
  if (!hasBullets) {
    return (
      <p className="text-base sm:text-lg text-muted-foreground whitespace-pre-line leading-relaxed max-w-[68ch]">
        {description}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {blocks.map((b, i) =>
        b.type === "paragraph" ? (
          <Reveal key={i}>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-[68ch]">
              {b.text}
            </p>
          </Reveal>
        ) : (
          <Reveal key={i} className="space-y-3">
            {b.heading && (
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                {b.heading}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {b.items.map((item, j) => (
                <div
                  key={j}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border bg-[hsl(var(--surface))]"
                >
                  <Check className="h-5 w-5 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>
        ),
      )}
      {guarantees.map((g, i) => (
        <Reveal key={`guarantee-${i}`}>
          <GuaranteeCard text={g} />
        </Reveal>
      ))}
    </div>
  );
}
