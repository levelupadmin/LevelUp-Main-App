/**
 * admissionPublicPolicy.test.ts — the guard on the public admission whitelist
 * (REQ-DEC-6 / SEC-PUBLIC-1).
 *
 * WHY THIS TEST READS `.sql` OFF DISK — a deliberate new pattern in this repo.
 * The thing under test is a database policy, and the only honest test of a
 * policy is an anonymous probe against a live database. Vitest here runs `src/**`
 * in jsdom with no database, and this phase is forbidden from applying
 * migrations, so the live probe is deferred to the council review on a shadow
 * project. What CAN be verified without a database is the migration's SHAPE, and
 * shape is where this class of leak actually comes from: a column quietly added
 * to a projection, a GRANT that widens past the whitelist, a `RAISE` that aborts
 * a sibling migration, a client that drifts from the policy it reads through.
 * So this file parses the migration and the page as text and asserts all four.
 *
 * It is intentionally dependency-free: no React, no supabase client, no jsdom
 * work. It reads two files and reasons about strings.
 *
 * The one nuance worth understanding before editing: a column may legitimately
 * appear in the migration as a FILTER and still be forbidden as OUTPUT.
 * `status` is exactly that — the RPC filters on an accepted-or-beyond set of
 * statuses and must never return the column. `admission_page_published_at` is
 * the same: it decides published-vs-not, and is never projected. So the deny
 * list is checked in two different scopes:
 *   • DENIED_ANYWHERE      — must not appear in the executable SQL at all.
 *   • DENIED_IN_PROJECTION — DENIED_ANYWHERE plus the filter-only columns; must
 *                            not appear in the fenced SELECT list, in any GRANT,
 *                            or in any view/function output shape.
 *
 * §11 pins the length CLAMP on the one applicant-typed field, on both the SQL
 * side and the client side. A whitelist over column NAMES does not by itself
 * hold the property the whitelist exists for — no applicant free text on a
 * public page — because `full_name` IS free text and an alias matcher decides
 * what lands in it. Two enforcements, so one edit cannot drop the invariant.
 *
 * §7 widens the lens to EVERY migration in the repo, because the anon REVOKE in
 * this one protects the anon role only: it is powerless against a policy that
 * opens `cohort_applications` to `authenticated`, whose stock table grants are
 * deliberately left in place. That accident can only be caught by looking at
 * every policy ever written for the table, which is what §7 does.
 *
 * §12 widens it once more, to every CLIENT read of the table, for the same
 * reason in the other direction. RLS and the grant layer decide WHICH ROWS a
 * caller may read; they say nothing about which COLUMNS come back. A student
 * reading their own row through a lawful policy still receives every column the
 * select asked for — so `select('*')` hands them `bio` (their essay),
 * `tally_data` (the raw submission) and `interview_notes` (a reviewer's private
 * prose about them), none of it rendered, all of it legible in the network tab.
 * That is exactly what `ApplicationStatus.tsx` did until this phase, and what
 * two earlier certifications of NFR-COPY-1 missed by grepping only new files.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locate the repo root from the runner's cwd. `import.meta.url` is not a `file:`
 * URL under vitest's jsdom transform, so it cannot be used here; walking up from
 * cwd keeps the test working whether vitest is invoked from the root or a
 * sub-directory.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const MIGRATION_FILE = join(
  repoRoot(),
  "supabase/migrations/20260728110000_admission_public_policy.sql",
);
const PAGE_FILE = join(repoRoot(), "src/pages/AdmissionPublic.tsx");

const migrationRaw = readFileSync(MIGRATION_FILE, "utf8");
const pageRaw = readFileSync(PAGE_FILE, "utf8");

/**
 * Strip `--` line comments and block comments so identifier checks run against
 * what Postgres will actually execute. The migration's header deliberately
 * NAMES every denied column so a reviewer can see the deny list; that prose
 * must not be mistaken for a leak.
 */
function strippedSql(): string {
  return migrationRaw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrationSql = strippedSql();

/**
 * The page with its comments removed, for checks that must not trip over prose.
 * The page's header explains what it deliberately does NOT do (`select('*')`),
 * and that explanation must not read as the thing itself. Line comments are only
 * stripped when `//` opens the line, so a `https://` inside a string survives.
 */
const pageCode = pageRaw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");

/** Case-insensitive whole-identifier match (`_` counts as a word character). */
function mentions(haystack: string, identifier: string): boolean {
  return new RegExp(`\\b${identifier}\\b`, "i").test(haystack);
}

/** Text between the migration's `>>> WHITELIST PROJECTION` fence markers. */
function whitelistProjection(): string {
  const open = migrationRaw.indexOf(">>> WHITELIST PROJECTION");
  const close = migrationRaw.indexOf("<<< WHITELIST PROJECTION");
  if (open === -1 || close === -1 || close <= open) return "";
  return migrationRaw.slice(migrationRaw.indexOf("\n", open) + 1, migrationRaw.lastIndexOf("\n", close));
}

/** Column names declared in the RPC's `RETURNS TABLE (...)` block, in order. */
function returnsTableColumns(): string[] {
  const match = /RETURNS TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/i.exec(migrationSql);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * The source of `pickWhitelist` in AdmissionPublic.tsx, comments included. Every
 * function in that file is top-level, so the first `\n}` after the declaration
 * closes it.
 */
function pickWhitelistSource(): string {
  const start = pageRaw.indexOf("function pickWhitelist");
  if (start === -1) return "";
  const end = pageRaw.indexOf("\n}", start);
  return end === -1 ? pageRaw.slice(start) : pageRaw.slice(start, end + 2);
}

/** The `ADMISSION_PUBLIC_FIELDS` literal as written in AdmissionPublic.tsx. */
function clientWhitelistFields(): string[] {
  const match = /const ADMISSION_PUBLIC_FIELDS\s*=\s*\[([^\]]*)\]/.exec(pageRaw);
  if (!match) return [];
  return Array.from(match[1].matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
}

/** The `CLAMPED_PUBLIC_FIELDS` literal as written in AdmissionPublic.tsx. */
function clientClampedFields(): string[] {
  const match = /const CLAMPED_PUBLIC_FIELDS[^=]*=\s*\[([^\]]*)\]/.exec(pageRaw);
  if (!match) return [];
  return Array.from(match[1].matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
}

/** Every GRANT statement in the executable SQL, whitespace-normalised. */
function grantStatements(): string[] {
  return Array.from(migrationSql.matchAll(/\bGRANT\b[^;]*;/gi)).map((m) =>
    m[0].replace(/\s+/g, " ").trim(),
  );
}

/**
 * The executable text of one function definition in this migration, from its
 * `CREATE [OR REPLACE] FUNCTION` down to the `$$;` that closes its body. Every
 * function here is quoted with `$$`, so that terminator is unambiguous.
 */
function functionDefinition(name: string): string {
  const start = migrationSql.search(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`, "i"),
  );
  if (start === -1) return "";
  const rest = migrationSql.slice(start);
  const end = rest.indexOf("$$;");
  return end === -1 ? rest : rest.slice(0, end + 3);
}

/**
 * Every `CREATE POLICY` statement on `cohort_applications` across ALL
 * migrations, comments stripped. Used by §7, which is the only check in this
 * file that looks outside the migration under test.
 */
function policiesOnApplications(): { file: string; statement: string }[] {
  const dir = join(repoRoot(), "supabase/migrations");
  const found: { file: string; statement: string }[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    for (const match of sql.matchAll(/\bCREATE\s+POLICY\b[^;]*;/gi)) {
      const statement = match[0].replace(/\s+/g, " ").trim();
      if (/\bON\s+(public\.)?cohort_applications\b/i.test(statement)) {
        found.push({ file, statement });
      }
    }
  }
  return found;
}

// ── The whitelist, enumerated literally ──────────────────────────────────────

/** What `anon` receives. Two fields. Anything else is a leak. */
const PERMITTED_PUBLIC_FIELDS = ["admitted_name", "program_title"];

/**
 * The character cap the one applicant-typed field is held to, on BOTH sides.
 * `full_name` is unbounded free text whose contents are decided by the Tally
 * alias matcher, so the whitelist's invariant — no applicant free text on a
 * public page — is only structural if the length is capped rather than assumed.
 * 80 is longer than any real name and far shorter than a paragraph.
 */
const PUBLIC_FIELD_CHAR_CAP = 80;

/**
 * Which of the permitted fields the cap applies to. Exactly the applicant-typed
 * one: `offerings.title` is admin-authored, the same string the public offering
 * page already prints, so clamping it would buy no invariant and would cut a
 * long cohort name mid-word with no ellipsis on a public credential card. The
 * asymmetry is pinned in both directions below, so neither half can drift into
 * clamping what it should not, or dropping the clamp where it matters.
 */
const CLAMPED_PUBLIC_FIELDS = ["admitted_name"];

/** The source columns those two are allowed to be read from. */
const PERMITTED_SOURCE_COLUMNS = [
  "full_name", // cohort_applications.full_name
  "title", // offerings.title, joined under the offerings_public_read predicate
];

/**
 * The statuses an admission may be in and still render publicly. `status` is a
 * LINEAR funnel (`20260413100000`), so it advances past 'accepted' on its own
 * the moment the student pays to claim the seat; pinning the set here is what
 * stops someone narrowing the filter back to `status = 'accepted'` and turning
 * the D-3 payment into a silent second kill-switch for every shared link. The
 * only revocation levers are meant to be NULLing the publish stamp, or the two
 * statuses that mean the person is no longer admitted.
 */
const PUBLISHABLE_STATUSES = ["accepted", "confirmation_paid", "balance_paid", "enrolled"];

/** Statuses that must NOT render publicly, whatever the publish stamp says. */
const UNPUBLISHABLE_STATUSES = [
  "submitted",
  "app_fee_paid",
  "interview_scheduled",
  "interview_done",
  "rejected",
  "withdrawn",
  "waitlisted",
];

/**
 * Never readable by anon in any form. `bio` IS the 100-word essay
 * (FIELD_ALIASES.bio, supabase/functions/_shared/tally.ts) and `tally_data` is
 * the entire raw Tally submission, so those two head the list.
 */
const DENIED_ANYWHERE = [
  "bio",
  "tally_data",
  "tally_response_id",
  "email",
  "phone",
  "city",
  "occupation",
  "rejection_reason",
  "interview_notes",
  "interview_date",
  "user_id",
  "app_fee_paid_at",
  "app_fee_payment_id",
  "confirmation_payment_id",
  "balance_payment_id",
  "reconciled_stage",
  "reconciled_key",
  "reconciled_at",
  "completed_no_fee",
  "contactable_partial",
];

/**
 * The projection scope additionally forbids the filter-only columns: the
 * internal funnel `status`, and the publish stamp in both the name it has on the
 * table and the alias it would carry if anyone re-projected it. The stamp says
 * when the SHARE PAGE went up, not when the person was admitted, so a card that
 * renders it as a date is asserting something the row cannot back.
 */
const DENIED_IN_PROJECTION = [
  ...DENIED_ANYWHERE,
  "status",
  "admission_page_published_at",
  "published_at",
];

// ── 1. The permitted list is exactly what was enumerated ─────────────────────

describe("the public whitelist is exactly two fields", () => {
  it("the RPC's RETURNS TABLE declares the enumerated permitted list, in order", () => {
    expect(returnsTableColumns()).toEqual(PERMITTED_PUBLIC_FIELDS);
  });

  it("the fenced projection reads only the enumerated source columns", () => {
    const projection = whitelistProjection();
    expect(projection).not.toBe("");
    for (const column of PERMITTED_SOURCE_COLUMNS) {
      expect(mentions(projection, column)).toBe(true);
    }
    // One `AS` alias per permitted field and no fourth line sneaking in.
    expect(projection.match(/\bAS\b/gi)?.length).toBe(PERMITTED_PUBLIC_FIELDS.length);
  });

  it("the client's field list mirrors the policy's, so the two cannot drift", () => {
    expect(clientWhitelistFields()).toEqual(PERMITTED_PUBLIC_FIELDS);
    expect(clientWhitelistFields()).toEqual(returnsTableColumns());
  });

  it("the page reaches the data only through the RPC, never a table select", () => {
    expect(pageCode).toContain("get_admission_page");
    expect(pageCode).not.toMatch(/\.from\s*\(/);
    expect(pageCode).not.toMatch(/select\s*\(\s*["'`]\s*\*/);
  });

  it("the page prints no date, so it cannot relabel a publish stamp as an admit date", () => {
    expect(mentions(pageRaw, "published_at")).toBe(false);
    expect(pageCode).not.toMatch(/DateTimeFormat|toLocaleDateString/);
    expect(pageCode).not.toMatch(/Admitted \$\{/);
  });

  it("the page tells a failed request apart from an unpublished record", () => {
    // Collapsing the two would tell an offline recipient that a live admission
    // was revoked, with no way back. The RPC's `error` must be read, and the
    // failure branch must offer a retry.
    expect(pageCode).toMatch(/\berror\b/);
    expect(pageCode).toMatch(/kind=\{[^}]*offline[^}]*\}/);
    expect(pageCode).toMatch(/onClick:/);
  });
});

// ── 2. The deny list reaches no projection, grant, or output shape ───────────

describe("the deny list is unreachable", () => {
  it.each(DENIED_IN_PROJECTION)("%s is not in the whitelist projection", (column) => {
    expect(mentions(whitelistProjection(), column)).toBe(false);
  });

  it.each(DENIED_IN_PROJECTION)("%s is not in the RPC's returned shape", (column) => {
    expect(returnsTableColumns().some((name) => name.toLowerCase() === column)).toBe(false);
  });

  it.each(DENIED_IN_PROJECTION)("%s is not named in any GRANT", (column) => {
    for (const statement of grantStatements()) {
      expect(mentions(statement, column)).toBe(false);
    }
  });

  it.each(DENIED_ANYWHERE)("%s does not appear in the executable SQL at all", (column) => {
    expect(mentions(migrationSql, column)).toBe(false);
  });

  it.each(DENIED_ANYWHERE)("%s does not appear in the public page", (column) => {
    // `status` is excluded from this sweep on purpose: the page uses
    // `role="status"` for the loading region's ARIA role, which is markup, not
    // a column read. The projection scope above is what forbids the column.
    expect(mentions(pageRaw, column)).toBe(false);
  });
});

// ── 3. No aborting RAISE (it would take sibling migrations down with it) ─────

describe("the migration cannot abort a sibling migration", () => {
  it("contains no RAISE EXCEPTION anywhere, comments included", () => {
    expect(migrationRaw).not.toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("contains no RAISE of any kind in the executable SQL", () => {
    expect(migrationSql).not.toMatch(/\bRAISE\b/i);
  });
});

// ── 4. Idempotent guards ─────────────────────────────────────────────────────

describe("the migration is idempotent", () => {
  it("adds both new columns with IF NOT EXISTS", () => {
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS\s+admission_page_slug/i);
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS\s+admission_page_published_at/i);
  });

  it("guards the unique index and the slug constraint", () => {
    expect(migrationSql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/i);
    expect(migrationSql).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint/i);
  });

  it("drops the RPC before recreating it (RETURNS TABLE cannot change in place)", () => {
    const drop = migrationSql.search(/DROP FUNCTION IF EXISTS public\.get_admission_page\(text\)/i);
    const create = migrationSql.search(/CREATE FUNCTION public\.get_admission_page\(/i);
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
  });

  it("creates the token minter with CREATE OR REPLACE", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.new_admission_page_slug\(\)/i);
  });

  it("adds nothing that defaults to published", () => {
    expect(migrationSql).not.toMatch(/admission_page_published_at[^,;]*DEFAULT/i);
    expect(migrationSql).not.toMatch(/admission_page_slug[^,;]*DEFAULT/i);
  });
});

// ── 5. Reversal block ────────────────────────────────────────────────────────

describe("the migration is reversible", () => {
  it("carries a commented reversal block at the foot", () => {
    const reversal = migrationRaw.slice(migrationRaw.indexOf("-- ── Reversal"));
    expect(reversal).not.toBe("");
    expect(reversal).toMatch(/DROP FUNCTION IF EXISTS public\.get_admission_page\(text\)/i);
    expect(reversal).toMatch(/DROP FUNCTION IF EXISTS public\.new_admission_page_slug\(\)/i);
    expect(reversal).toMatch(/DROP FUNCTION IF EXISTS public\.publish_admission_page\(uuid\)/i);
    expect(reversal).toMatch(/DROP FUNCTION IF EXISTS public\.unpublish_admission_page\(uuid\)/i);
    expect(reversal).toMatch(/DROP COLUMN IF EXISTS admission_page_slug/i);
    expect(reversal).toMatch(/DROP COLUMN IF EXISTS admission_page_published_at/i);
  });

  it("documents an undo of the anon REVOKE that genuinely inverts it", () => {
    // `REVOKE ALL` drops Supabase's stock default-privilege grant set, so a
    // documented `GRANT SELECT` would restore a state the table was never in.
    const reversal = migrationRaw.slice(migrationRaw.indexOf("-- ── Reversal"));
    expect(reversal).toMatch(/GRANT ALL ON TABLE public\.cohort_applications TO anon/i);
    expect(reversal).not.toMatch(/GRANT SELECT ON TABLE public\.cohort_applications TO anon/i);
  });

  it("keeps the reversal commented out so the forward migration never runs it", () => {
    const reversal = migrationRaw.slice(migrationRaw.indexOf("-- ── Reversal"));
    for (const line of reversal.split("\n")) {
      if (line.trim() === "") continue;
      expect(line.trimStart().startsWith("--")).toBe(true);
    }
  });
});

// ── 6. Scoping: an anonymous probe reaches nothing beyond the whitelist ──────

describe("the anon surface is exactly one function", () => {
  it("adds no RLS policy at all, least of all an anon SELECT on the table", () => {
    expect(migrationSql).not.toMatch(/CREATE\s+POLICY/i);
    expect(migrationSql).not.toMatch(/TO anon\s+USING/i);
  });

  it("revokes anon's table privileges so the grant layer denies a direct probe", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON TABLE public\.cohort_applications FROM anon/i,
    );
  });

  it("grants anon EXECUTE on the reader and nothing else", () => {
    const anonGrants = grantStatements().filter((statement) => /\banon\b/i.test(statement));
    expect(anonGrants).toHaveLength(1);
    expect(anonGrants[0]).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_admission_page\(text\) TO anon, authenticated;/i,
    );
  });

  it("never grants anon anything on a table or a view", () => {
    for (const statement of grantStatements()) {
      if (!/\banon\b/i.test(statement)) continue;
      expect(statement).not.toMatch(/\bON (TABLE|ALL TABLES|SEQUENCE)\b/i);
    }
  });

  it("does not hand the token minter to anon", () => {
    // `authenticated` DOES hold EXECUTE, because the publisher in §5 runs
    // SECURITY INVOKER and an admin therefore mints the token as themselves.
    // That grant gives nothing away: the minter reads no table and returns a
    // random string. It is the UPDATE that is gated, and anon reaches neither.
    const minterGrants = grantStatements().filter((statement) =>
      /new_admission_page_slug/i.test(statement),
    );
    expect(minterGrants).toHaveLength(1);
    expect(minterGrants[0]).toMatch(/TO authenticated, service_role;?$/i);
    expect(mentions(minterGrants[0], "anon")).toBe(false);
    // No table is named inside the minter, so it cannot become a read path.
    expect(functionDefinition("new_admission_page_slug")).not.toMatch(/\bFROM\s+public\./i);
  });

  it("hardens the reader: SECURITY DEFINER, STABLE, pinned search_path", () => {
    const reader = migrationSql.slice(
      migrationSql.search(/CREATE FUNCTION public\.get_admission_page\(/i),
    );
    expect(reader).toMatch(/SECURITY DEFINER/i);
    expect(reader).toMatch(/\bSTABLE\b/i);
    expect(reader).toMatch(/SET search_path = public, pg_temp/i);
  });

  it("returns zero rows for an unpublished or short slug", () => {
    expect(migrationSql).toMatch(/admission_page_published_at IS NOT NULL/i);
    expect(migrationSql).toMatch(/length\(p_slug\) >= 32/i);
    expect(migrationSql).toMatch(/LIMIT 1/i);
  });

  it("filters on the accepted-or-beyond status SET, never on 'accepted' alone", () => {
    // `status = 'accepted'` alone would 404 every shared link the instant the
    // student paid to claim the seat, because the funnel advances on payment.
    expect(migrationSql).not.toMatch(/a\.status\s*=\s*'accepted'/i);
    const statusFilter = /a\.status IN \(([^)]*)\)/i.exec(migrationSql);
    expect(statusFilter).not.toBeNull();
    const pinned = Array.from(statusFilter![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    expect(pinned).toEqual(PUBLISHABLE_STATUSES);
  });

  it.each(UNPUBLISHABLE_STATUSES)("%s is not a publishable status", (status) => {
    const statusFilter = /a\.status IN \(([^)]*)\)/i.exec(migrationSql);
    expect(statusFilter![1]).not.toContain(`'${status}'`);
  });

  it("re-states the offerings_public_read predicate rather than trusting RLS", () => {
    // SECURITY DEFINER bypasses RLS, so a private offering's title must be
    // excluded by the join itself; the page then degrades to its
    // cohort-agnostic frame instead of naming an unlisted cohort.
    expect(migrationSql).toMatch(/LEFT JOIN public\.offerings o/i);
    expect(migrationSql).toMatch(/o\.is_public = true/i);
    expect(migrationSql).toMatch(/o\.status = 'active'/i);
  });

  it("keys the public URL on a token that cannot be the row's own uuid", () => {
    expect(migrationSql).toMatch(/length\(admission_page_slug\) >= 32/i);
    expect(migrationSql).toMatch(/admission_page_slug <> id::text/i);
  });
});

// ── 7. No migration, anywhere, opens this table to everyone ──────────────────
//
// The anon REVOKE in §3 covers the anon role and nothing else. The likelier
// accident is a policy with no TO clause (which applies to PUBLIC, hence to
// `authenticated`) or one scoped `TO authenticated`: both sail past the grant
// layer, because authenticated's stock grants are deliberately untouched so
// students keep reading their own row. Only a sweep of every policy ever
// written for this table can catch that, so this is the one check in the file
// that reads outside the migration under test.

describe("cohort_applications is never opened to a whole role", () => {
  const policies = policiesOnApplications();

  it("finds the policies it is supposed to be guarding", () => {
    // A parser that silently matched nothing would make every check below
    // vacuously pass. Today: admin_manage_applications + students_read_own.
    expect(policies.length).toBeGreaterThanOrEqual(2);
  });

  it("every policy on the table narrows by the caller's identity", () => {
    for (const { file, statement } of policies) {
      // `auth.uid()` in the predicate is what makes a policy per-caller rather
      // than per-role. A policy without it is either `USING (true)` or scoped
      // on something that does not identify the reader.
      expect(`${file}: ${statement}`).toMatch(/auth\.uid\(\)/i);
    }
  });

  it("no policy on the table is unconditionally permissive", () => {
    for (const { file, statement } of policies) {
      expect(`${file}: ${statement}`).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(`${file}: ${statement}`).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    }
  });

  it("no migration grants anon a privilege on the table", () => {
    const dir = join(repoRoot(), "supabase/migrations");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ");
      for (const match of sql.matchAll(/\bGRANT\b[^;]*;/gi)) {
        const statement = match[0].replace(/\s+/g, " ").trim();
        if (!/\bcohort_applications\b/i.test(statement)) continue;
        expect(`${file}: ${statement}`).not.toMatch(/\banon\b/i);
      }
    }
  });
});

// ── 8. The publish path exists, and the existing policy authorizes it ────────
//
// Without a writer the marker could never be set, the page would be
// unreachable, and "unpublish → 404" could not be exercised end to end — least
// of all by the council against a live anonymous probe.

describe("publishing is reachable and admin-gated", () => {
  const publisher = functionDefinition("publish_admission_page");
  const unpublisher = functionDefinition("unpublish_admission_page");

  it("ships both a publisher and an unpublisher", () => {
    expect(publisher).not.toBe("");
    expect(unpublisher).not.toBe("");
  });

  it("drops both before creating them, so a later shape change still applies", () => {
    for (const name of ["publish_admission_page", "unpublish_admission_page"]) {
      const drop = migrationSql.search(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${name}\\(uuid\\)`, "i"),
      );
      const create = migrationSql.search(
        new RegExp(`CREATE FUNCTION public\\.${name}\\(`, "i"),
      );
      expect(drop).toBeGreaterThan(-1);
      expect(create).toBeGreaterThan(drop);
    }
  });

  it("leans on the existing RLS policy instead of re-deriving 'admin'", () => {
    // SECURITY INVOKER means `admin_manage_applications` decides whether the
    // UPDATE lands. A second admin check inside a SECURITY DEFINER body would
    // be a second definition of admin, free to drift from the first.
    for (const writer of [publisher, unpublisher]) {
      expect(writer).toMatch(/SECURITY INVOKER/i);
      expect(writer).not.toMatch(/SECURITY DEFINER/i);
    }
  });

  it("writes no funnel status (SOR-1): status is a precondition only", () => {
    expect(publisher).toMatch(/status IN \(/i);
    expect(publisher).not.toMatch(/\bstatus\s*=/i);
    expect(unpublisher).not.toMatch(/\bstatus\s*=/i);
  });

  it("publishes only for an admission that is accepted or beyond", () => {
    const statusFilter = /status IN \(([^)]*)\)/i.exec(publisher);
    expect(statusFilter).not.toBeNull();
    const pinned = Array.from(statusFilter![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    expect(pinned).toEqual(PUBLISHABLE_STATUSES);
  });

  it("is idempotent, so re-publishing cannot invalidate a link already shared", () => {
    expect(publisher).toMatch(/COALESCE\(admission_page_slug,/i);
    expect(publisher).toMatch(/COALESCE\(admission_page_published_at,/i);
  });

  it("unpublish clears BOTH the stamp and the token, so shared links die", () => {
    expect(unpublisher).toMatch(/admission_page_slug\s*=\s*NULL/i);
    expect(unpublisher).toMatch(/admission_page_published_at\s*=\s*NULL/i);
    // No status precondition: taking a page down must never be blocked by
    // where the applicant happens to sit in the funnel.
    expect(unpublisher).not.toMatch(/status IN \(/i);
  });

  it("hands the writers to no anonymous caller", () => {
    const writerGrants = grantStatements().filter((statement) =>
      /publish_admission_page/i.test(statement),
    );
    expect(writerGrants).toHaveLength(2);
    for (const statement of writerGrants) {
      expect(statement).toMatch(/TO authenticated, service_role;?$/i);
      expect(mentions(statement, "anon")).toBe(false);
    }
  });

  it("documents the URL a token turns into, so the link shape has one source", () => {
    expect(migrationRaw).toMatch(/\/admission\/</);
  });
});

// ── 9. What the page hands to third parties ──────────────────────────────────
//
// The app root boots analytics for every route with no allow-list, so the
// page cannot claim "no analytics call" and be believed. What it CAN do is
// keep per-record data out of what those vendors read, and occupy the pixel
// globals `src/lib/analytics.ts` guards its loaders on while the share token
// is in the address bar. Both are asserted here.

describe("the public page leaks nothing to the analytics layer", () => {
  it("keeps the document title constant, so no vendor logs the name", () => {
    const call = /usePageTitle\(([^)]*)\)/.exec(pageCode);
    expect(call).not.toBeNull();
    // A literal identifier, never an interpolation or a row read.
    expect(call![1]).not.toContain("`");
    expect(call![1]).not.toMatch(/\brow\b|\bstate\b|\bslug\b/);
    expect(pageCode).toMatch(/const PAGE_TITLE = "[^"$`]*"/);
  });

  it("occupies every pixel global the loaders guard on", () => {
    for (const global of ["fbq", "gtag", "clarity", "twq"]) {
      expect(pageCode).toContain(`"${global}"`);
    }
  });

  it("restores the pixels on unmount instead of killing them for the session", () => {
    // Deleting the stubs is not enough: the app's single boot already ran, so
    // the page has to re-run it against the URL the visitor moved on to.
    expect(pageCode).toMatch(/delete window\[key\]/);
    expect(pageCode).toMatch(/bootAnalytics\(\)/);
  });

  it("never claims to have suppressed a pixel a previous route already loaded", () => {
    // The stub is only installed when the global is absent, so a pixel loaded
    // earlier in the SPA session is left exactly as it was found.
    expect(pageCode).toMatch(/if \(window\[key\]\) continue;/);
  });
});

// ── 10. The page says only what it can back ──────────────────────────────────

describe("the public page's copy is honest", () => {
  it("reads the flag key from the shared registry rather than redefining it", () => {
    expect(pageCode).toMatch(/import \{[^}]*DECISION_FLOW[^}]*\} from "@\/lib\/flags"/);
    expect(pageCode).not.toMatch(/const DECISION_FLOW\s*=/);
  });

  it("promises no notification, because /signup delivers none", () => {
    // The app's notify-me lives on the catalogue cards, behind the account
    // wall. A public card cannot reach it, so it must not offer it.
    expect(pageCode).not.toMatch(/notif/i);
  });

  it("lets a long admitted name wrap instead of clipping under overflow-x: clip", () => {
    const heading = /<motion\.h1[\s\S]*?>/.exec(pageCode);
    expect(heading).not.toBeNull();
    expect(heading![0]).toMatch(/break-words/);
  });

  it("says plainly that the feature flag is not the boundary", () => {
    // The bundle is behind VITE_DECISION_FLOW; the database half is not. §4
    // grants anon EXECUTE the moment the migration applies, and `flag()`
    // resolves a per-device localStorage override ahead of the compiled
    // default. Neither is weakened — but the docs must not sell either as
    // containment, because a reader who believes it stops checking the three
    // properties that ARE the boundary.
    expect(pageRaw).toMatch(/THE FLAG IS NOT THE BOUNDARY/);
    expect(pageRaw).toMatch(/localStorage/);
    expect(migrationRaw).toMatch(/IS NOT, A BOUNDARY/);
    expect(migrationRaw).toMatch(/localStorage/);
    // The three real properties, named on the migration side: the clamped
    // two-column projection, the share token, and an empty published set.
    expect(migrationRaw).toMatch(/~244-bit token/);
    expect(migrationRaw).toMatch(/admission_page_published_at` is NULL on every existing row/);
  });

  it("states the token's entropy as measured, not as its string length", () => {
    // Two `gen_random_uuid()` draws are two v4 uuids, and a v4 uuid carries 122
    // random bits, not 128: the version and variant nibbles are fixed. 244 bits
    // is unguessable by any margin that matters, so this is not a hole — but a
    // section whose stated purpose is that the docs must not sell the flag or
    // the URL as containment cannot carry an inflated figure of its own.
    expect(migrationRaw).toMatch(/244 bits of entropy/);
    expect(migrationRaw).toMatch(/122 random/);
    // Neither half may describe the token by its string length again.
    expect(migrationRaw).not.toMatch(/\b256[- ]bits?\b/i);
    expect(pageRaw).not.toMatch(/\b256[- ]bits?\b/i);
  });

  it("attributes the private screen to nobody, since the record may not exist", () => {
    const privateScreen = /kind="404"[\s\S]*?\/>/.exec(pageCode);
    expect(privateScreen).not.toBeNull();
    // The same screen answers a typo'd address, where there is no person to
    // speak for, and unpublishing is an admin write the applicant cannot make.
    expect(privateScreen![0]).not.toMatch(/\bwanted\b|\bchose\b|\btheir wish/i);
    expect(privateScreen![0]).toMatch(/character|address|link/i);
  });
});

// ── 11. The clamp on the one applicant-typed field, on BOTH sides ────────────
//
// The whitelist is a list of column NAMES; the property it exists to hold is
// "no applicant free text reaches a public page". `full_name` is applicant free
// text — unbounded, and which answer lands in it is decided by the Tally alias
// matcher, which is documented to be fallible (an INPUT_TEXT question worded
// "Full name of my mentor" outscoring a DROPDOWN titled "Name", and one
// tie-break away from filing an occupation answer). A question worded "tell us
// your name and a bit about what you make" therefore files three sentences of
// prose into it, which an anonymous stranger reads verbatim. So the cap is
// asserted on the SQL side AND the client side: two independent enforcements,
// so a later edit cannot quietly drop the invariant by touching one of them,
// and the client's cap still holds when an older function body is live.
//
// Two things this section pins beyond the cap's existence. The UNIT: `left()`
// counts code points and `.slice()` counts UTF-16 units, so a client cutting
// with a bare slice would halve an emoji's surrogate pair into a U+FFFD while
// the server cut cleanly. And the SCOPE: the clamp covers the applicant-typed
// field only, on both sides, because `offerings.title` is admin-authored and
// truncating it silently is a regression rather than a guard.

describe("the applicant-typed field is clamped, not trusted", () => {
  it("the SQL projection clamps the name to the enumerated cap", () => {
    const projection = whitelistProjection();
    const clamp = /left\(\s*a\.full_name\s*,\s*(\d+)\s*\)\s+AS\s+admitted_name/i.exec(projection);
    expect(clamp).not.toBeNull();
    expect(Number(clamp![1])).toBe(PUBLIC_FIELD_CHAR_CAP);
  });

  it("the SQL projection never hands the raw column over", () => {
    // i.e. no `a.full_name AS admitted_name` alongside or instead of the clamp.
    expect(whitelistProjection()).not.toMatch(/a\.full_name\s+AS/i);
  });

  it("the client declares the same cap, so the two halves cannot drift", () => {
    const declared = /const MAX_PUBLIC_FIELD_CHARS\s*=\s*(\d+)/.exec(pageCode);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(PUBLIC_FIELD_CHAR_CAP);
  });

  it("pickWhitelist clamps inside the same loop that trims and null-guards", () => {
    const picker = pickWhitelistSource();
    expect(picker).not.toBe("");
    // One loop over the whitelist, so no field can be picked past the guard.
    expect(picker).toMatch(/for \(const key of ADMISSION_PUBLIC_FIELDS\)/);
    expect(picker).toMatch(/CLAMPED_PUBLIC_FIELDS\.includes\(key\)/);
    expect(picker).toMatch(/\.slice\(0, MAX_PUBLIC_FIELD_CHARS\)/);
    // A clamped-to-empty value must read as absent, not as a blank name.
    expect(picker).toMatch(/=== ""/);
  });

  it("the client cuts on code points, the unit Postgres left() counts", () => {
    // `left(text, 80)` counts code points; `.slice(0, 80)` on a string counts
    // UTF-16 units. On an emoji straddling the boundary — free text, and
    // exactly the input this clamp exists for — a bare slice halves the
    // surrogate pair and paints U+FFFD into the page's h1. Spreading a string
    // iterates code points, so the two halves cut in the same place.
    // (Spread rather than `Array.from`, which would trip §1's `.from(` guard.)
    const picker = pickWhitelistSource();
    expect(picker).toMatch(/\[\.\.\.\w+\]\.slice\(0, MAX_PUBLIC_FIELD_CHARS\)/);
    expect(picker).not.toMatch(/\w+\.slice\(0, MAX_PUBLIC_FIELD_CHARS\)/);
  });

  it("clamps the applicant-typed field only, on both sides, and says so", () => {
    // The asymmetry is deliberate and has to be pinned in BOTH directions, or
    // the halves drift the other way: `offerings.title` is admin-authored, so
    // capping it buys no invariant and costs a real one — a long cohort name
    // cut mid-word, with no ellipsis, on the most screenshotted surface in the
    // funnel. The page's own h1 argues exactly that about truncation.
    expect(clientClampedFields()).toEqual(CLAMPED_PUBLIC_FIELDS);
    // Every clamped client field is a field the SQL projection clamps too.
    for (const field of clientClampedFields()) {
      expect(whitelistProjection()).toMatch(
        new RegExp(`left\\([^)]*\\)\\s+AS\\s+${field}\\b`, "i"),
      );
    }
    // And the unclamped one is unclamped on both sides.
    for (const field of PERMITTED_PUBLIC_FIELDS.filter(
      (name) => !CLAMPED_PUBLIC_FIELDS.includes(name),
    )) {
      expect(whitelistProjection()).not.toMatch(
        new RegExp(`left\\([^)]*\\)\\s+AS\\s+${field}\\b`, "i"),
      );
    }
    expect(migrationRaw).toMatch(/ADMIN-authored/);
  });
});

// ── 12. No client surface reads this table with a wildcard ───────────────────
//
// The scope is `src/**` — every file that ships to a browser. It deliberately
// does NOT cover `supabase/functions/`: an edge function runs on the service
// role, server-side, and a wildcard there sends nothing to a client. The leak
// this section exists to stop is a column arriving in a RESPONSE BODY the
// applicant can open, which is a property of the client select and nothing else.
//
// Two shapes count as explicit: a string literal, and an identifier bound to one
// in the same file (`DECISION_COLUMNS`, `APPLICATION_COLUMNS`,
// `APPLICATION_ROW_COLUMNS` — the constant form is preferred, because it makes
// the column list greppable as a unit). Anything else — a bare `.select()`, a
// computed argument — fails too: a list that cannot be read off the source
// cannot be reviewed, and this whole section is a review aid.

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function clientSourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) found.push(path);
    }
  };
  walk(join(repoRoot(), "src"));
  return found.sort();
}

/** Comments stripped, so prose ABOUT a wildcard is never read as one. */
function strippedSource(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

/**
 * The first argument of a `.select(` call, read off the text that follows it.
 * Only the first argument matters: it is the column list, and the second (PostgREST
 * options like `{ count: "exact" }`) never names a column. Parsing the literal to
 * its closing quote is what keeps an embedded join — `offerings(title)` — from
 * being mistaken for the end of the call.
 */
function firstSelectArgument(after: string): { kind: string; value: string } {
  const literal = /^\s*(["'`])([\s\S]*?)\1/.exec(after);
  if (literal) return { kind: "literal", value: literal[2] };
  const identifier = /^\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(after);
  if (identifier) return { kind: "identifier", value: identifier[1] };
  if (/^\s*\)/.test(after)) return { kind: "none", value: "" };
  return { kind: "unparsed", value: after.slice(0, 40).trim() };
}

/** The right-hand side of `const NAME = ...;` in one file's stripped source. */
function constantValue(code: string, name: string): string | null {
  const match = new RegExp(`const ${name}\\b[^=]*=([\\s\\S]*?);`).exec(code);
  return match ? match[1] : null;
}

/**
 * Every `.select(...)` a client surface issues against `cohort_applications`,
 * with its column list resolved to source text. A `.from(...)` with no `.select(`
 * after it is an update or a delete, and is skipped: this section is about what
 * comes BACK.
 */
function applicationSelects(): {
  file: string;
  kind: string;
  argument: string;
  columns: string;
}[] {
  const found: { file: string; kind: string; argument: string; columns: string }[] = [];
  for (const path of clientSourceFiles()) {
    const code = strippedSource(readFileSync(path, "utf8"));
    const file = relative(repoRoot(), path);
    for (const from of code.matchAll(/\.from\(\s*["'`]cohort_applications["'`]\s*\)/g)) {
      // Bounded so a `.select(` further down the file, against another table,
      // is never attributed to this chain.
      const tail = code.slice(from.index! + from[0].length, from.index! + from[0].length + 400);
      const select = /\.select\(/.exec(tail);
      if (!select) continue;
      const arg = firstSelectArgument(tail.slice(select.index + select[0].length));
      const columns =
        arg.kind === "identifier" ? (constantValue(code, arg.value) ?? "") : arg.value;
      found.push({ file, kind: arg.kind, argument: arg.value, columns });
    }
  }
  return found;
}

/**
 * The surfaces this sweep is supposed to be guarding. Naming them is what stops
 * a parser that silently matched nothing from making every check below
 * vacuously pass — the same trap §7 guards against with its policy count.
 */
const KNOWN_APPLICATION_READERS = [
  "src/hooks/useDecision.ts",
  "src/pages/ApplicationStatus.tsx",
  "src/pages/CheckoutPage.tsx",
  "src/pages/admin/AdminApplications.tsx",
];

/** Columns no client select of this table may ask for, on any surface. */
const NEVER_FETCHED_BY_A_CLIENT = ["bio"];

describe("no client surface selects cohort_applications with a wildcard", () => {
  const selects = applicationSelects();

  it("finds the reads it is supposed to be guarding", () => {
    const files = [...new Set(selects.map((entry) => entry.file))].sort();
    for (const reader of KNOWN_APPLICATION_READERS) {
      expect(files).toContain(reader);
    }
    // Admin alone issues seven (six count queries + the paginated table), so a
    // scan that collapsed to one match per file has broken.
    expect(selects.length).toBeGreaterThanOrEqual(KNOWN_APPLICATION_READERS.length + 6);
  });

  it("every select names its columns explicitly", () => {
    for (const entry of selects) {
      // "none" = a bare `.select()`, "unparsed" = a computed argument. Both
      // return a column list nobody can review by reading the file. `at` carries
      // the call site into the failure diff.
      expect({ at: `${entry.file}: .select(${entry.argument})`, kind: entry.kind }).toEqual({
        at: `${entry.file}: .select(${entry.argument})`,
        kind: expect.stringMatching(/^(literal|identifier)$/),
      });
    }
  });

  it("no select asks for `*`", () => {
    for (const entry of selects) {
      // The resolved list, so `select(SOME_CONSTANT)` cannot hide one.
      expect(`${entry.file}: ${entry.columns}`).not.toContain("*");
    }
  });

  it("an identifier argument resolves to a real column list", () => {
    // Otherwise an unresolvable constant would read as an empty list and sail
    // past the check above with nothing in it.
    for (const entry of selects.filter((candidate) => candidate.kind === "identifier")) {
      expect(`${entry.file}: ${entry.argument}`).toMatch(/\w/);
      expect(entry.columns.trim()).not.toBe("");
    }
  });

  it.each(NEVER_FETCHED_BY_A_CLIENT)("%s reaches no client select", (column) => {
    // `bio` IS the 100-word essay (FIELD_ALIASES.bio,
    // supabase/functions/_shared/tally.ts). No client surface renders it, admin
    // included, so no client surface has any business fetching it.
    for (const entry of applicationSelects()) {
      expect(`${entry.file}: ${entry.columns}`).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("the student's status page fetches nothing it does not render", () => {
    const page = selects.filter(
      (entry) => entry.file === "src/pages/ApplicationStatus.tsx",
    );
    expect(page).toHaveLength(1);
    const columns = page[0].columns;
    // The whole point of the fix: the three columns the wildcard used to ship.
    for (const denied of ["bio", "tally_data", "interview_notes", "email", "phone"]) {
      expect(columns).not.toMatch(new RegExp(`\\b${denied}\\b`));
    }
    // And what it does render, so a later trim cannot silently break the page.
    for (const rendered of ["id", "user_id", "offering_id", "status", "created_at", "rejection_reason"]) {
      expect(columns).toMatch(new RegExp(`\\b${rendered}\\b`));
    }
  });

  it("the admin console keeps the two columns it genuinely renders, and says why", () => {
    // The asymmetry with the student page is deliberate, not an unexplained
    // allowlist entry: an admin RENDERS `interview_notes` (the Interview column
    // and the notes dialog) and `tally_data` (the Tally dialog). Pinning it here
    // means a future trim of the admin list fails loudly instead of quietly
    // emptying two dialogs — and the rationale has to stay in the file.
    const adminRaw = readFileSync(
      join(repoRoot(), "src/pages/admin/AdminApplications.tsx"),
      "utf8",
    );
    const table = selects.filter(
      (entry) =>
        entry.file === "src/pages/admin/AdminApplications.tsx" &&
        entry.columns.includes("offerings(title)"),
    );
    expect(table).toHaveLength(1);
    // The docblock the column list is declared under IS the rationale.
    const declaration = adminRaw.indexOf("const APPLICATION_ROW_COLUMNS");
    expect(declaration).toBeGreaterThan(-1);
    const rationale = adminRaw.slice(adminRaw.lastIndexOf("/**", declaration), declaration);
    expect(rationale).toMatch(/renders/i);
    for (const rendered of ["interview_notes", "tally_data"]) {
      expect(table[0].columns).toMatch(new RegExp(`\\b${rendered}\\b`));
      expect(rationale).toContain(rendered);
    }
  });
});
