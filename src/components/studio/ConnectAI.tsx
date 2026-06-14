import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Copy, Check, Trash2, ShieldCheck } from "lucide-react";
import * as studio from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

export default function ConnectAI() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["studio", "keys"], queryFn: studio.listMcpKeys });
  const [issued, setIssued] = useState<{ url: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = useMutation({
    mutationFn: studio.issueMcpKey,
    onSuccess: (d) => { setIssued(d); qc.invalidateQueries({ queryKey: ["studio", "keys"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: studio.revokeMcpKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "keys"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[hsl(var(--accent-amber)/0.12)] text-[hsl(var(--accent-amber))]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Connect your AI</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Plug your own ChatGPT or Claude into Studio. It can reason over every reel you've saved
            <span className="text-[hsl(var(--foreground))]"> and your cohort's learnings</span> — privately, only yours.
          </p>
        </div>
      </div>

      {!issued ? (
        <Button className="mt-4" onClick={() => issue.mutate()} disabled={issue.isPending}>
          {issue.isPending ? "Generating…" : "Generate my connection"}
        </Button>
      ) : (
        <div className="mt-4 rounded-xl border border-[hsl(var(--accent-amber)/0.4)] bg-[hsl(var(--accent-amber)/0.06)] p-3">
          <p className="text-xs font-medium text-[hsl(var(--accent-amber))] flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Copy this now — it's shown only once.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 text-xs break-all rounded-lg bg-[hsl(var(--surface-2))] px-2 py-1.5">{issued.url}</code>
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => copy(issued.url)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="claude" className="mt-5">
        <TabsList>
          <TabsTrigger value="claude">Claude</TabsTrigger>
          <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
        </TabsList>
        <TabsContent value="claude" className="text-sm text-[hsl(var(--muted-foreground))] space-y-1.5 mt-3">
          <p>1. Open Claude → Settings → Connectors → Add custom connector.</p>
          <p>2. Paste the URL above. Name it “My Studio”.</p>
          <p>3. Ask: <span className="text-[hsl(var(--foreground))]">“What hooks have I been saving lately?”</span></p>
        </TabsContent>
        <TabsContent value="chatgpt" className="text-sm text-[hsl(var(--muted-foreground))] space-y-1.5 mt-3">
          <p>1. ChatGPT custom connectors are desktop/web only today (developer mode).</p>
          <p>2. Settings → Connectors → Add → paste the URL above.</p>
          <p>3. Ask it to pull ideas from your saved reels for your next video.</p>
        </TabsContent>
      </Tabs>

      {(keys.data?.length ?? 0) > 0 && (
        <div className="mt-5 border-t border-[hsl(var(--border))] pt-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Active connections</p>
          <div className="space-y-1.5">
            {keys.data!.map((k) => (
              <div key={k.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono">…{k.key_hint}</span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto h-8 px-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                  onClick={() => revoke.mutate(k.id)} disabled={revoke.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
