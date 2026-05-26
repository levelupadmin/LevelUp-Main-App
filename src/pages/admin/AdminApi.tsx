/**
 * AdminApi
 * ────────────────────────────────────────────────────────────────────
 * One screen to manage everything that powers the LevelUp admin-api
 * (the edge function the CLI + MCP + every CRM/automation tool talks
 * to). Four tabs:
 *
 *   • Keys      — issue/revoke team API keys (eat our own dog food via
 *                 the `create_team_api_key` RPC, so we never roll our
 *                 own bcrypt in TS).
 *   • Webhooks  — subscribe external systems to events (user.created,
 *                 enrolment.granted, crm_contact.created, …). Includes
 *                 a "test ping" button that does an actual POST.
 *   • Activity  — last 200 rows of `api_call_log` so the Founders Office
 *                 can spot which keys are noisy and which actions
 *                 break.
 *   • Surface   — auto-generated browser of every action exposed by
 *                 the edge function. Click an action → see params,
 *                 scope, copy a curl recipe.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Key as KeyIcon,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
  Activity as ActivityIcon,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

/* ─────────────────── types ─────────────────── */

interface ApiKey {
  id: string;
  name: string;
  scope: "read" | "write" | "admin";
  key_hint: string;
  created_by: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
  users?: { email: string | null; full_name: string | null } | null;
}

interface WebhookSub {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  active: boolean;
  description: string | null;
  last_triggered_at: string | null;
  failure_count: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_at: string;
}

interface CallLogRow {
  id: number;
  api_key_id: string | null;
  action: string;
  status_code: number;
  duration_ms: number | null;
  ip: string | null;
  error_message: string | null;
  created_at: string;
}

interface EventType {
  type: string;
  description: string;
}

const API_URL = "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/admin-api";

const SCOPE_COLORS: Record<string, string> = {
  read: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  write: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  admin: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

/* ─────────────────── helpers ─────────────────── */

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtRelative(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
}

/* ═══════════════════════════════════════════════════
   Keys tab
   ═══════════════════════════════════════════════════ */

function KeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write" | "admin">("read");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; plaintext: string } | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_api_keys")
      .select(
        "id, name, scope, key_hint, created_by, last_used_at, last_used_ip, revoked_at, expires_at, created_at, users:created_by (email, full_name)",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load keys", description: error.message, variant: "destructive" });
    } else {
      setKeys((data as ApiKey[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data: userResult } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc("create_team_api_key", {
      p_name: name.trim(),
      p_scope: scope,
      p_expires_at: null,
      p_created_by: userResult.user?.id,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Failed to create key", description: error.message, variant: "destructive" });
      return;
    }
    const row = (data as Array<{ key_id: string; plaintext: string; hint: string }>)[0];
    if (row) {
      setRevealed({ name: name.trim(), plaintext: row.plaintext });
    }
    setName("");
    setScope("read");
    setCreateOpen(false);
    load();
  };

  const handleRevoke = async (id: string, label: string) => {
    if (!confirm(`Revoke "${label}"? Existing CLI/MCP installs using this key stop working immediately.`)) return;
    const { error } = await supabase.from("team_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Key revoked" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Team API keys</h2>
          <p className="text-sm text-muted-foreground">
            These power the CLI, MCP, and any CRM/automation tool that talks to{" "}
            <code className="text-xs">{API_URL}</code>.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Issue key
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No keys yet. Click <em>Issue key</em> above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Scope</th>
                <th className="px-4 py-2.5">Hint</th>
                <th className="px-4 py-2.5">Owner</th>
                <th className="px-4 py-2.5">Last used</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const status = k.revoked_at
                  ? "revoked"
                  : k.expires_at && new Date(k.expires_at) < new Date()
                  ? "expired"
                  : "active";
                return (
                  <tr key={k.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={SCOPE_COLORS[k.scope]}>{k.scope}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">…{k.key_hint}</td>
                    <td className="px-4 py-3 text-muted-foreground">{k.users?.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtRelative(k.last_used_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!k.revoked_at && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id, k.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Issue dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a new API key</DialogTitle>
            <DialogDescription>
              The plaintext is shown only once after creation. Save it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders Office — HubSpot sync" />
              <p className="text-xs text-muted-foreground mt-1">Only you and other admins see this label.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">read — list/get only</SelectItem>
                  <SelectItem value="write">write — read + non-destructive writes</SelectItem>
                  <SelectItem value="admin">admin — everything (issue keys, delete rows)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal dialog */}
      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyIcon className="h-5 w-5 text-amber-500" />
              Your new API key
            </DialogTitle>
            <DialogDescription>
              This is the only time you'll see the plaintext. Copy it now.
            </DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{revealed.name}</div>
                <div className="font-mono text-xs bg-surface-2 p-3 rounded-md break-all">{revealed.plaintext}</div>
              </div>
              <Button
                onClick={() => { copy(revealed.plaintext); toast({ title: "Copied" }); }}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy plaintext
              </Button>
              <div className="text-xs text-muted-foreground space-y-1">
                <div><strong>CLI:</strong> <code>levelup auth set {revealed.plaintext.slice(0, 12)}…</code></div>
                <div><strong>MCP:</strong> set <code>LEVELUP_API_KEY</code> in your Claude Desktop config</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>I saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Webhooks tab
   ═══════════════════════════════════════════════════ */

function WebhooksTab() {
  const [subs, setSubs] = useState<WebhookSub[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [subsRes, eventsRes] = await Promise.all([
      supabase
        .from("webhook_subscriptions")
        .select(
          "id, name, url, event_types, active, description, last_triggered_at, failure_count, last_failure_at, last_failure_reason, created_at",
        )
        .order("created_at", { ascending: false }),
      // Fetch event types from API (it's a static list)
      Promise.resolve({
        data: [
          { type: "user.created", description: "A new user account is created (signup or admin grant)" },
          { type: "enrolment.granted", description: "A user is enrolled in an offering (purchase or admin grant)" },
          { type: "crm_contact.created", description: "A new lead lands in crm_contacts (ad form, lead_capture RPC)" },
          { type: "crm_contact.converted", description: "A lead is converted to a paying user" },
          { type: "webhook.test", description: "Manual test ping from /admin/api" },
        ] as EventType[],
      }),
    ]);
    if (subsRes.error) {
      toast({ title: "Failed to load webhooks", description: subsRes.error.message, variant: "destructive" });
    } else {
      setSubs((subsRes.data as WebhookSub[]) ?? []);
    }
    setEventTypes(eventsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleEvent = (t: string) => {
    setSelectedEvents((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleCreate = async () => {
    if (!name.trim() || !url.trim() || selectedEvents.length === 0) {
      toast({ title: "Name, URL, and at least one event type required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const secret =
      "whk_" +
      Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const { data: userResult } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("webhook_subscriptions")
      .insert({
        name: name.trim(),
        url: url.trim(),
        secret,
        event_types: selectedEvents,
        description: description.trim() || null,
        created_by: userResult.user?.id ?? null,
      })
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setCreatedSecret(secret);
    setName(""); setUrl(""); setDescription(""); setSelectedEvents([]);
    setCreateOpen(false);
    load();
  };

  const handleToggle = async (sub: WebhookSub) => {
    const { error } = await supabase
      .from("webhook_subscriptions")
      .update({ active: !sub.active })
      .eq("id", sub.id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete webhook "${label}"?`)) return;
    const { error } = await supabase.from("webhook_subscriptions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Webhook deleted" });
    load();
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    const { data: keyData, error: keyErr } = await supabase.functions.invoke("admin-api", {
      body: { action: "webhooks.test", params: { id } },
    });
    setTestingId(null);
    if (keyErr) {
      toast({ title: "Test failed", description: keyErr.message, variant: "destructive" });
      return;
    }
    if (keyData?.delivered) {
      toast({ title: "Delivered ✓", description: `HTTP ${keyData.http_status}` });
    } else {
      toast({ title: "Delivery failed", description: keyData?.error ?? `HTTP ${keyData?.http_status}`, variant: "destructive" });
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Webhook subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Push events to Zapier, Make, n8n, or any HTTPS endpoint. Each webhook payload includes an{" "}
            <code className="text-xs">X-LevelUp-Signature</code> header for verification.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add webhook
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : subs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No webhooks yet. Wire one up to your CRM, Slack, or automation tool of choice.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">URL</th>
                <th className="px-4 py-2.5">Events</th>
                <th className="px-4 py-2.5">Last triggered</th>
                <th className="px-4 py-2.5">Active</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[260px]">
                    <span className="font-mono text-xs">{s.url}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.event_types.map((e) => (
                        <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtRelative(s.last_triggered_at)}
                    {s.failure_count > 0 && (
                      <div className="text-xs text-rose-500">{s.failure_count} failures</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(s)}
                      className={`text-xs px-2 py-1 rounded ${s.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {s.active ? "on" : "off"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => handleTest(s.id)} disabled={testingId === s.id}>
                      {testingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id, s.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a webhook</DialogTitle>
            <DialogDescription>
              We'll POST a JSON payload to your URL whenever any of the selected events fire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HubSpot — new enrolments" />
            </div>
            <div>
              <label className="text-sm font-medium">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this webhook is for" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Event types</label>
              <div className="space-y-1.5">
                {eventTypes.map((e) => (
                  <label key={e.type} className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(e.type)}
                      onChange={() => toggleEvent(e.type)}
                      className="mt-0.5"
                    />
                    <div>
                      <code className="text-xs">{e.type}</code>
                      <div className="text-xs text-muted-foreground">{e.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show signing secret once */}
      <Dialog open={!!createdSecret} onOpenChange={(o) => !o && setCreatedSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Webhook created
            </DialogTitle>
            <DialogDescription>
              Use this signing secret to verify the <code>X-LevelUp-Signature</code> header on incoming requests.
            </DialogDescription>
          </DialogHeader>
          {createdSecret && (
            <>
              <div className="font-mono text-xs bg-surface-2 p-3 rounded-md break-all">{createdSecret}</div>
              <Button
                onClick={() => { copy(createdSecret); toast({ title: "Copied" }); }}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy secret
              </Button>
            </>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Activity tab
   ═══════════════════════════════════════════════════ */

function ActivityTab() {
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("api_call_log")
      .select("id, api_key_id, action, status_code, duration_ms, ip, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filterAction.trim()) q = q.eq("action", filterAction.trim());
    if (filterStatus.trim()) q = q.eq("status_code", parseInt(filterStatus, 10));
    const { data } = await q;
    setRows((data as CallLogRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterAction, filterStatus]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">API activity</h2>
          <p className="text-sm text-muted-foreground">Last 200 calls. Use the filters to drill in.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            placeholder="action e.g. offerings.list"
            className="w-56"
          />
          <Input
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            placeholder="status"
            className="w-24"
          />
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No calls match those filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Latency</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="px-4 py-2.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2">
                    <Badge variant={r.status_code < 300 ? "default" : "destructive"} className="text-[10px]">
                      {r.status_code}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{r.duration_ms ?? "—"}ms</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{r.ip ?? "—"}</td>
                  <td className="px-4 py-2 text-rose-500 text-xs truncate max-w-[260px]">{r.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Surface tab
   ═══════════════════════════════════════════════════ */

const ACTION_GROUPS: Record<string, { label: string; description: string }> = {
  system: { label: "System", description: "Ping, identify, list actions." },
  offerings: { label: "Offerings", description: "Read/create/update masterclasses, bundles, BFP cohorts." },
  courses: { label: "Courses", description: "Course CRUD (each offering has one course)." },
  chapters: { label: "Chapters", description: "Lecture management + bulk reorder." },
  events: { label: "Events", description: "Live sessions and Q&As." },
  enrolments: { label: "Enrolments", description: "Who has access to what + bulk export." },
  users: { label: "Users", description: "Search, list, tags, notes, marketing prefs, export." },
  revenue: { label: "Revenue", description: "Summary + per-offering breakdowns." },
  cohorts: { label: "Cohorts", description: "Weeks, members, attendance." },
  coupons: { label: "Coupons", description: "Discount code management." },
  leads: { label: "Leads (CRM)", description: "Pre-purchase contacts, bulk import, conversion." },
  payments: { label: "Payments", description: "Razorpay orders, refunds." },
  campaigns: { label: "Campaigns", description: "Trigger transactional + bulk email." },
  webhooks: { label: "Webhooks", description: "Subscriptions + delivery log." },
  keys: { label: "API keys", description: "Eat-our-own-dog-food key management." },
  analytics: { label: "Analytics", description: "Funnel, UTM breakdown, cohort engagement." },
};

function SurfaceTab() {
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.functions.invoke("admin-api", {
        body: { action: "system.list_actions" },
      });
      setActions(data?.actions ?? []);
      setLoading(false);
    })();
  }, []);

  const grouped: Record<string, string[]> = {};
  for (const a of actions) {
    const [ns] = a.split(".");
    grouped[ns] = grouped[ns] ?? [];
    grouped[ns].push(a);
  }

  const filtered = (a: string) => a.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Action surface</h2>
          <p className="text-sm text-muted-foreground">
            {actions.length} actions live. Each maps to a single CLI command and one MCP tool.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter actions…"
          className="w-64"
        />
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {Object.keys(grouped).sort().map((ns) => {
            const items = grouped[ns].filter(filtered);
            if (!items.length) return null;
            const meta = ACTION_GROUPS[ns] ?? { label: ns, description: "" };
            return (
              <Card key={ns} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold tracking-tight">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">{meta.description}</div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-1">
                  {items.map((a) => (
                    <div key={a} className="flex items-center justify-between text-xs">
                      <code className="font-mono">{a}</code>
                      <button
                        onClick={() => {
                          copy(
                            `curl -X POST ${API_URL} \\\n  -H "Authorization: Bearer $LEVELUP_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"${a}","params":{}}'`,
                          );
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy curl recipe"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   page
   ═══════════════════════════════════════════════════ */

const AdminApi = () => {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">API & integrations</h1>
          <Badge variant="secondary" className="text-[10px]">
            <Sparkles className="h-3 w-3 mr-1" />
            new
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Single console for the LevelUp admin-api — the surface your Founders Office, marketing
          team, CRMs, and automation tools talk to. Issue keys, wire up webhooks, browse the
          action catalogue, and audit every call.
        </p>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys"><KeyIcon className="h-4 w-4 mr-1.5" />Keys</TabsTrigger>
          <TabsTrigger value="webhooks"><WebhookIcon className="h-4 w-4 mr-1.5" />Webhooks</TabsTrigger>
          <TabsTrigger value="activity"><ActivityIcon className="h-4 w-4 mr-1.5" />Activity</TabsTrigger>
          <TabsTrigger value="surface"><Sparkles className="h-4 w-4 mr-1.5" />Surface</TabsTrigger>
        </TabsList>
        <TabsContent value="keys"><KeysTab /></TabsContent>
        <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="surface"><SurfaceTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminApi;
