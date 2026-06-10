/**
 * Builds a single markdown export of the entire docs portal.
 *
 * Usage: click "Download as markdown" anywhere in /admin/docs and
 * this concatenates every tab's content into one .md you can paste
 * into Claude (or any other LLM) as a system prompt. The output is
 * structured with H1/H2/H3 so the LLM can navigate by section.
 */
import { OVERVIEW_SECTIONS } from "./content/overview";
import { FEATURES } from "./content/features";
import { FLOWS } from "./content/flows";
import { TECH_SECTIONS } from "./content/tech";
import { SCHEMA_TABLES } from "./content/schema";
import type { ChangelogRow } from "./types";

function statusLabel(s: string) {
  switch (s) {
    case "shipped": return "✅ Shipped";
    case "partial": return "🚧 Partial";
    case "planned": return "📋 Planned";
    case "deprecated": return "⚠️ Deprecated";
    default: return s;
  }
}

export function buildMarkdown(changelog: ChangelogRow[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("# LevelUp Main App: Documentation Bundle");
  lines.push("");
  lines.push(`> Generated ${now} from \`/admin/docs\`. This bundle is the canonical reference for the LevelUp Main App. Paste it as a system prompt to any LLM (Claude, GPT, Gemini) and they'll have full context on what's built.`);
  lines.push("");

  /* ─────────── Overview ─────────── */
  lines.push("# Overview");
  lines.push("");
  for (const s of OVERVIEW_SECTIONS) {
    lines.push(`## ${s.title}`);
    lines.push("");
    lines.push(s.body);
    lines.push("");
  }

  /* ─────────── Features ─────────── */
  lines.push("# Features (catalogue)");
  lines.push("");
  lines.push("Every capability in the app with its status. **Greppable**: if a feature shows as ✅ Shipped with codeRefs, don't rebuild it.");
  lines.push("");
  const byArea: Record<string, typeof FEATURES> = {};
  for (const f of FEATURES) {
    (byArea[f.area] ??= []).push(f);
  }
  for (const area of Object.keys(byArea).sort()) {
    lines.push(`## ${area}`);
    lines.push("");
    for (const f of byArea[area]) {
      lines.push(`### ${f.title}  -  ${statusLabel(f.status)}`);
      lines.push("");
      lines.push(`**Slug:** \`${f.slug}\`  ·  **Area:** ${f.area}`);
      lines.push("");
      lines.push(f.summary);
      lines.push("");
      if (f.codeRefs?.length) {
        lines.push(`**Code:** ${f.codeRefs.map((r) => `\`${r}\``).join(", ")}`);
        lines.push("");
      }
      if (f.appRefs?.length) {
        lines.push(`**In-app:** ${f.appRefs.map((r) => `\`${r}\``).join(", ")}`);
        lines.push("");
      }
      if (f.details) {
        lines.push(f.details);
        lines.push("");
      }
    }
  }

  /* ─────────── Flows ─────────── */
  lines.push("# Flows (user journeys)");
  lines.push("");
  for (const flow of FLOWS) {
    lines.push(`## ${flow.title}`);
    lines.push("");
    lines.push(`*Audience: ${flow.audience}.*  ${flow.summary}`);
    lines.push("");
    for (const step of flow.steps) {
      lines.push(`**${step.title}**`);
      lines.push("");
      lines.push(step.description);
      lines.push("");
    }
  }

  /* ─────────── Tech ─────────── */
  lines.push("# Architecture + tech stack");
  lines.push("");
  for (const s of TECH_SECTIONS) {
    lines.push(`## ${s.title}`);
    lines.push("");
    lines.push(s.body);
    lines.push("");
  }

  /* ─────────── Schema ─────────── */
  lines.push("# Database schema");
  lines.push("");
  for (const t of SCHEMA_TABLES) {
    lines.push(`## \`public.${t.name}\``);
    lines.push("");
    lines.push(t.purpose);
    lines.push("");
    if (t.rowCountRange) {
      lines.push(`**Row count:** ${t.rowCountRange}`);
      lines.push("");
    }
    if (t.keyColumns.length) {
      lines.push("**Key columns:**");
      lines.push("");
      for (const col of t.keyColumns) {
        lines.push(`- \`${col.name}\` (${col.type}) - ${col.description}`);
      }
      lines.push("");
    }
    if (t.relationships?.length) {
      lines.push("**Relationships:**");
      lines.push("");
      for (const r of t.relationships) lines.push(`- ${r}`);
      lines.push("");
    }
  }

  /* ─────────── API surface ─────────── */
  lines.push("# Admin API");
  lines.push("");
  lines.push(`Single edge function endpoint: \`https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/admin-api\`.`);
  lines.push("");
  lines.push(`Body shape: \`{ "action": "<namespace>.<command>", "params": { ... } }\``);
  lines.push("");
  lines.push("Auth: \`Authorization: Bearer lvlup_…\` (key from /admin/api). Scope-gated: read|write|admin.");
  lines.push("");
  lines.push("74 actions live. Use \`system.list_actions\` to enumerate. Browse the full catalogue in /admin/docs → API tab.");
  lines.push("");

  /* ─────────── Changelog ─────────── */
  lines.push("# Changelog");
  lines.push("");
  for (const c of changelog) {
    const date = c.shipped_at ? new Date(c.shipped_at).toISOString().slice(0, 10) : "unscheduled";
    lines.push(`## ${date} - ${c.title}  ${statusLabel(c.status)}`);
    lines.push("");
    lines.push(`*${c.area}${c.version ? ` · ${c.version}` : ""}${c.user_facing ? " · user-facing" : " · internal"}*`);
    lines.push("");
    lines.push(c.summary);
    lines.push("");
    if (c.body_md) {
      lines.push(c.body_md);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename = "levelup-docs.md") {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
