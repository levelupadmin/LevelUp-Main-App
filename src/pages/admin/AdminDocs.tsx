/**
 * AdminDocs
 * ────────────────────────────────────────────────────────────────────
 * World-class documentation portal for the LevelUp Main App.
 *
 * Seven tabs:
 *   • Overview   — what the app is, business model, where to start
 *   • Features   — atomic capability catalogue with shipped/partial/
 *                  planned/deprecated status badges
 *   • Flows      — user journeys with mobile/desktop screenshot toggle
 *   • Tech       — architecture, stack, deployment, secrets
 *   • Schema     — every public.* table that matters
 *   • API        — admin-api / CLI / MCP reference (cross-link to /admin/api)
 *   • Changelog  — human-readable change log from doc_changelog table
 *
 * Cross-cutting features:
 *   • Per-tab search box (filters subsections by title + body)
 *   • Screenshot mobile/desktop toggle (global, sticky)
 *   • "Download as markdown" — one big .md for LLM consumption
 *   • Sidebar of subsections in each tab (anchor links)
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Download,
  Smartphone,
  Monitor,
  FileText,
  Sparkles,
  GitBranch,
  Database,
  Code2,
  Workflow,
  Bookmark,
  ExternalLink,
  CheckCircle2,
  Wrench,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";

import { OVERVIEW_SECTIONS } from "@/docs/content/overview";
import { FEATURES } from "@/docs/content/features";
import { FLOWS } from "@/docs/content/flows";
import { TECH_SECTIONS } from "@/docs/content/tech";
import { SCHEMA_TABLES } from "@/docs/content/schema";
import { buildMarkdown, downloadMarkdown } from "@/docs/download";
import type { ChangelogRow, FeatureStatus } from "@/docs/types";

/* ─────────── status pill helper ─────────── */

const STATUS_STYLES: Record<FeatureStatus, { className: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  shipped: { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "Shipped", icon: CheckCircle2 },
  partial: { className: "bg-amber-500/15 text-amber-400 border-amber-500/20", label: "Partial", icon: Wrench },
  planned: { className: "bg-slate-500/15 text-slate-400 border-slate-500/20", label: "Planned", icon: Calendar },
  deprecated: { className: "bg-rose-500/15 text-rose-400 border-rose-500/20", label: "Deprecated", icon: AlertTriangle },
};

function StatusPill({ status }: { status: FeatureStatus }) {
  const s = STATUS_STYLES[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.className}`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

/* ─────────── markdown-lite renderer (prose) ─────────── */
/* We don't ship a full markdown parser — the prose in our content
 * files uses a small subset: paragraphs separated by blank lines,
 * **bold**, *italic*, `code`, and bullet lists with leading "- ".
 * This keeps the bundle tiny and gives us full control over styling. */

function Prose({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/);
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:tracking-tight prose-code:text-cream prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-foreground prose-a:text-cream">
      {blocks.map((block, i) => {
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />)}
            </ul>
          );
        }
        if (block.match(/^\d+\.\s/)) {
          const items = block.split("\n").filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s/, ""));
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />)}
            </ol>
          );
        }
        if (block.startsWith("```")) {
          const code = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={i} className="bg-surface-2 p-3 rounded text-xs overflow-x-auto"><code>{code}</code></pre>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: inline(block) }} />;
      })}
    </div>
  );
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

/* ─────────── screenshot pair w/ mobile/desktop toggle ─────────── */

function ScreenshotFrame({
  desktop,
  mobile,
  placeholder,
  device,
}: {
  desktop?: string;
  mobile?: string;
  placeholder?: string;
  device: "desktop" | "mobile";
}) {
  const src = device === "mobile" ? mobile : desktop;
  if (src) {
    return (
      <div className={`border border-border rounded-lg overflow-hidden bg-surface-2 ${device === "mobile" ? "max-w-[280px]" : "w-full"}`}>
        <img src={src} alt="" className="w-full h-auto" />
      </div>
    );
  }
  return (
    <div className={`border-2 border-dashed border-border rounded-lg ${device === "mobile" ? "max-w-[280px] aspect-[9/19.5]" : "aspect-video"} bg-surface-2 flex items-center justify-center p-6 text-center`}>
      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
          {device} screenshot pending
        </div>
        {placeholder && <p className="text-sm text-muted-foreground">{placeholder}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Overview tab
   ═══════════════════════════════════════════════════ */

function OverviewTab({ search }: { search: string }) {
  const filtered = OVERVIEW_SECTIONS.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.body.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-6">
      <nav className="md:sticky md:top-4 self-start text-sm space-y-1">
        {OVERVIEW_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="block px-2 py-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-6 min-w-0">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="text-xl font-semibold tracking-tight mb-3">{s.title}</h2>
            <Prose source={s.body} />
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No sections match "{search}"</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Features tab
   ═══════════════════════════════════════════════════ */

function FeaturesTab({ search }: { search: string }) {
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "all">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const visible = useMemo(() => {
    return FEATURES.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (areaFilter !== "all" && f.area !== areaFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return f.title.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q) ||
               f.slug.toLowerCase().includes(q) || (f.details || "").toLowerCase().includes(q) ||
               (f.codeRefs || []).some((r) => r.toLowerCase().includes(q));
      }
      return true;
    });
  }, [search, statusFilter, areaFilter]);

  const areas = useMemo(() => Array.from(new Set(FEATURES.map((f) => f.area))).sort(), []);

  const grouped = useMemo(() => {
    const out: Record<string, typeof FEATURES> = {};
    for (const f of visible) (out[f.area] ??= []).push(f);
    return out;
  }, [visible]);

  const counts = useMemo(() => {
    const c = { shipped: 0, partial: 0, planned: 0, deprecated: 0 };
    for (const f of FEATURES) c[f.status]++;
    return c;
  }, []);

  return (
    <div className="space-y-4">
      {/* Counts strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(counts) as [FeatureStatus, number][]).map(([k, v]) => {
          const s = STATUS_STYLES[k];
          const Icon = s.icon;
          return (
            <Card
              key={k}
              className={`p-3 cursor-pointer transition-colors ${statusFilter === k ? "border-cream/50" : ""}`}
              onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`h-4 w-4 ${s.className.split(" ").find((x) => x.startsWith("text-"))}`} />
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">{s.label}</div>
                  <div className="text-lg font-semibold">{v}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Area filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setAreaFilter("all")}
          className={`px-2.5 py-1 text-xs rounded-md border ${areaFilter === "all" ? "border-cream/40 text-foreground bg-surface" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          All areas
        </button>
        {areas.map((a) => (
          <button
            key={a}
            onClick={() => setAreaFilter(a)}
            className={`px-2.5 py-1 text-xs rounded-md border ${areaFilter === a ? "border-cream/40 text-foreground bg-surface" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Features grid */}
      {Object.keys(grouped).length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No features match these filters.</Card>
      ) : (
        Object.keys(grouped).sort().map((area) => (
          <div key={area}>
            <h2 className="text-sm font-semibold tracking-tight mb-2 text-muted-foreground">{area}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {grouped[area].map((f) => (
                <Card key={f.slug} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold leading-tight">{f.title}</h3>
                    <StatusPill status={f.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{f.summary}</p>
                  {f.details && (
                    <details className="text-xs text-muted-foreground mb-2">
                      <summary className="cursor-pointer text-cream">Details</summary>
                      <p className="pt-2">{f.details}</p>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                    {f.codeRefs?.map((r) => (
                      <span key={r} className="px-1.5 py-0.5 bg-surface-2 text-muted-foreground rounded">{r}</span>
                    ))}
                    {f.appRefs?.map((r) => (
                      <Link key={r} to={r} className="px-1.5 py-0.5 bg-cream/10 text-cream rounded hover:bg-cream/20 inline-flex items-center gap-0.5">
                        {r} <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Flows tab w/ mobile/desktop toggle
   ═══════════════════════════════════════════════════ */

function FlowsTab({ search, device, onDeviceChange }: { search: string; device: "desktop" | "mobile"; onDeviceChange: (d: "desktop" | "mobile") => void }) {
  const filtered = FLOWS.filter((f) =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) ||
    f.summary.toLowerCase().includes(search.toLowerCase()) ||
    f.steps.some((s) => s.title.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <Card className="p-3 flex items-center justify-between bg-surface">
        <div className="text-sm text-muted-foreground">Screenshots</div>
        <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-md">
          <button
            onClick={() => onDeviceChange("desktop")}
            className={`px-2.5 py-1 text-xs rounded inline-flex items-center gap-1.5 ${device === "desktop" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button
            onClick={() => onDeviceChange("mobile")}
            className={`px-2.5 py-1 text-xs rounded inline-flex items-center gap-1.5 ${device === "mobile" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
      </Card>

      {filtered.map((flow) => (
        <div key={flow.slug} id={flow.slug} className="space-y-3 scroll-mt-20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold tracking-tight">{flow.title}</h2>
              <Badge variant="secondary" className="text-[10px]">{flow.audience}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{flow.summary}</p>
          </div>
          <div className="space-y-3">
            {flow.steps.map((step, i) => (
              <Card key={i} className="p-4 grid md:grid-cols-[1fr_320px] gap-4">
                <div>
                  <h3 className="font-medium mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                <ScreenshotFrame
                  desktop={step.screenshot?.desktop}
                  mobile={step.screenshot?.mobile}
                  placeholder={step.screenshot?.placeholder}
                  device={device}
                />
              </Card>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">No flows match "{search}"</Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Tech tab
   ═══════════════════════════════════════════════════ */

function TechTab({ search }: { search: string }) {
  const filtered = TECH_SECTIONS.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.body.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-6">
      <nav className="md:sticky md:top-4 self-start text-sm space-y-1">
        {TECH_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="block px-2 py-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-6 min-w-0">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="text-xl font-semibold tracking-tight mb-3">{s.title}</h2>
            <Prose source={s.body} />
          </section>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Schema tab
   ═══════════════════════════════════════════════════ */

function SchemaTab({ search }: { search: string }) {
  const filtered = SCHEMA_TABLES.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.purpose.toLowerCase().includes(q) ||
           t.keyColumns.some((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  });
  return (
    <div className="space-y-3">
      {filtered.map((t) => (
        <Card key={t.name} className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-mono font-semibold">public.{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t.purpose}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {t.surfacedInAdmin && <Badge variant="secondary" className="text-[10px]">in admin</Badge>}
              {t.rowCountRange && <span className="text-[10px] text-muted-foreground font-mono">{t.rowCountRange}</span>}
            </div>
          </div>
          {t.keyColumns.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-cream font-medium">Key columns ({t.keyColumns.length})</summary>
              <div className="mt-2 space-y-1.5 text-xs">
                {t.keyColumns.map((c) => (
                  <div key={c.name} className="grid grid-cols-[160px_120px_1fr] gap-2">
                    <code className="font-mono text-cream">{c.name}</code>
                    <code className="font-mono text-muted-foreground">{c.type}</code>
                    <span className="text-muted-foreground">{c.description}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {t.relationships && t.relationships.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-cream font-medium">Relationships ({t.relationships.length})</summary>
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-1">
                {t.relationships.map((r, i) => <li key={i} className="font-mono">{r}</li>)}
              </ul>
            </details>
          )}
        </Card>
      ))}
      {filtered.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">No tables match "{search}"</Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   API tab (cross-links to /admin/api)
   ═══════════════════════════════════════════════════ */

function ApiTab() {
  const [actions, setActions] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("admin-api", { body: { action: "system.list_actions" } });
      setActions(data?.actions ?? []);
    })();
  }, []);

  const grouped: Record<string, string[]> = {};
  for (const a of actions) (grouped[a.split(".")[0]] ??= []).push(a);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Admin API endpoint</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Single edge function at{" "}
          <code className="text-cream">https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/admin-api</code>.
          Authenticate with a Bearer key from <Link to="/admin/api" className="text-cream underline">/admin/api → Keys</Link>.
        </p>
        <pre className="text-xs bg-surface-2 p-3 rounded overflow-x-auto"><code>{`curl -X POST https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/admin-api \\
  -H "Authorization: Bearer lvlup_..." \\
  -H "Content-Type: application/json" \\
  -d '{"action":"offerings.list","params":{"status":"active","limit":5}}'`}</code></pre>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">CLI</h2>
        <p className="text-sm text-muted-foreground">
          Standalone Node CLI repo: <code>github.com/levelupadmin/levelup-cli</code>. Install with{" "}
          <code>gh repo clone levelupadmin/levelup-cli && cd levelup-cli && npm link</code>.
          Auth via <code>levelup auth set lvlup_…</code>. See per-key install instructions at{" "}
          <Link to="/admin/api" className="text-cream underline">/admin/api → Install</Link>.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">MCP server</h2>
        <p className="text-sm text-muted-foreground">
          Repo: <code>github.com/levelupadmin/levelup-mcp</code>. Drop into Claude Desktop or Claude Code config.
          Auto-discovers all actions via <code>system.list_actions</code>.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">{actions.length} actions available</h2>
        {actions.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {Object.keys(grouped).sort().map((ns) => (
              <div key={ns}>
                <div className="text-xs font-mono uppercase text-muted-foreground mb-1">{ns}</div>
                <div className="space-y-0.5">
                  {grouped[ns].map((a) => (
                    <code key={a} className="block text-xs font-mono text-cream">{a}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Changelog tab (DB-backed)
   ═══════════════════════════════════════════════════ */

function ChangelogTab({ search, rows }: { search: string; rows: ChangelogRow[] }) {
  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q) ||
           (r.area || "").toLowerCase().includes(q) || (r.body_md || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {rows.length === 0 ? "No changelog entries yet." : `No entries match "${search}"`}
        </Card>
      ) : (
        filtered.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold">{c.title}</h3>
                  <StatusPill status={c.status} />
                  {!c.user_facing && <Badge variant="secondary" className="text-[10px]">internal</Badge>}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {c.shipped_at ? new Date(c.shipped_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "unscheduled"}
                  {" · "}{c.area}
                  {c.version && ` · ${c.version}`}
                  {" · "}{c.author}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{c.summary}</p>
            {c.body_md && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-cream font-medium">Details</summary>
                <div className="mt-2 text-sm text-muted-foreground">
                  <Prose source={c.body_md} />
                </div>
              </details>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   page
   ═══════════════════════════════════════════════════ */

const AdminDocs = () => {
  usePageTitle("Documentation");
  const [search, setSearch] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [changelog, setChangelog] = useState<ChangelogRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("doc_changelog")
        .select("id, title, summary, area, status, shipped_at, version, body_md, author, user_facing, created_at")
        .order("shipped_at", { ascending: false, nullsFirst: false });
      setChangelog((data as ChangelogRow[]) ?? []);
    })();
  }, []);

  const handleDownload = () => {
    const md = buildMarkdown(changelog);
    const date = new Date().toISOString().slice(0, 10);
    downloadMarkdown(md, `levelup-docs-${date}.md`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
            <Badge variant="secondary" className="text-[10px]"><Sparkles className="h-3 w-3 mr-1" />v3</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            World-class reference for the LevelUp Main App. Built so any teammate, new dev, or AI assistant
            can read this and understand exactly what's been built — and what hasn't.
          </p>
        </div>
        <Button onClick={handleDownload} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download as markdown
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search this section…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="overview"><Bookmark className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="features"><CheckCircle2 className="h-4 w-4 mr-1.5" />Features</TabsTrigger>
          <TabsTrigger value="flows"><Workflow className="h-4 w-4 mr-1.5" />Flows</TabsTrigger>
          <TabsTrigger value="tech"><Code2 className="h-4 w-4 mr-1.5" />Tech</TabsTrigger>
          <TabsTrigger value="schema"><Database className="h-4 w-4 mr-1.5" />Schema</TabsTrigger>
          <TabsTrigger value="api"><FileText className="h-4 w-4 mr-1.5" />API</TabsTrigger>
          <TabsTrigger value="changelog"><GitBranch className="h-4 w-4 mr-1.5" />Changelog</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab search={search} /></TabsContent>
        <TabsContent value="features"><FeaturesTab search={search} /></TabsContent>
        <TabsContent value="flows"><FlowsTab search={search} device={device} onDeviceChange={setDevice} /></TabsContent>
        <TabsContent value="tech"><TechTab search={search} /></TabsContent>
        <TabsContent value="schema"><SchemaTab search={search} /></TabsContent>
        <TabsContent value="api"><ApiTab /></TabsContent>
        <TabsContent value="changelog"><ChangelogTab search={search} rows={changelog} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDocs;
