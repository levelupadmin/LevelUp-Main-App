// Studio (Content Brain) data layer.
// Reads go straight through the Supabase client (RLS isolates each user's
// cb_reels). Captures POST to the studio-worker on Vercel, authenticated with
// the logged-in user's access token (the worker verifies it and resolves the
// user server-side — no secret in the client).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Reel = Database["public"]["Tables"]["cb_reels"]["Row"];
export type Folder = Database["public"]["Tables"]["cb_folders"]["Row"];
export type Bucket = "learn" | "adapt" | "saved";

export const BUCKETS: { key: Bucket; label: string; blurb: string }[] = [
  { key: "learn", label: "Learn", blurb: "Techniques to study" },
  { key: "adapt", label: "Adapt", blurb: "Ideas to make your own" },
  { key: "saved", label: "Saved", blurb: "Everything else" },
];

export const HIGHLIGHTS = [
  "hook", "editing", "cuts", "visual-aesthetic", "format", "pacing",
  "content", "audio", "sound", "storytelling", "text-overlay", "treatment", "trend",
] as const;

const WORKER_URL =
  (import.meta.env.VITE_STUDIO_WORKER_URL as string) || "https://levelup-studio-worker.vercel.app";

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Is this user allowed into Studio (active live-cohort member)? */
export async function isStudioEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_studio_enabled");
  if (error) return false;
  return data === true;
}

/** A reel/video URL looks like Instagram or YouTube. */
export function looksCapturable(url: string): boolean {
  return /instagram\.com\/(reel|reels|p|tv)\/|youtube\.com\/(watch|shorts|embed|live)|youtu\.be\//i.test(url || "");
}

export async function captureReel(
  url: string,
  bucket: Bucket = "saved",
  source: "paste" | "clipboard" | "shortcut" = "paste",
): Promise<{ id: string; status: string; dedup: boolean }> {
  const token = await accessToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${WORKER_URL}/api/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: url.trim(), bucket, source }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) throw new Error("Studio is for active cohort members.");
    throw new Error((json as { error?: string }).error || `Couldn't save that link (${res.status}).`);
  }
  return json as { id: string; status: string; dedup: boolean };
}

export async function listReels(opts: { bucket?: Bucket | "all"; folderId?: string; q?: string } = {}): Promise<Reel[]> {
  // A custom-folder view joins through cb_folder_items.
  if (opts.folderId) {
    const { data, error } = await supabase
      .from("cb_folder_items")
      .select("cb_reels(*)")
      .eq("folder_id", opts.folderId);
    if (error) throw error;
    let reels = (data || []).map((r) => (r as { cb_reels: Reel }).cb_reels).filter(Boolean);
    if (opts.q && opts.q.trim()) {
      const needle = opts.q.trim().toLowerCase();
      reels = reels.filter((r) =>
        `${r.transcript ?? ""} ${r.caption ?? ""} ${r.title ?? ""} ${r.creator_username ?? ""}`.toLowerCase().includes(needle));
    }
    return reels.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  let query = supabase.from("cb_reels").select("*").order("created_at", { ascending: false }).limit(300);
  if (opts.bucket && opts.bucket !== "all") query = query.eq("bucket", opts.bucket);
  if (opts.q && opts.q.trim()) query = query.textSearch("fts", opts.q.trim(), { type: "websearch", config: "english" });
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Reel[];
}

export async function updateReel(
  id: string,
  patch: Partial<Pick<Reel, "bucket" | "note" | "tags" | "highlights">>,
): Promise<void> {
  // "Acted" = moved to adapt OR a note was added. Stamp it for the Revisit engine.
  const acted = patch.bucket === "adapt" || (typeof patch.note === "string" && patch.note.trim().length > 0);
  const body: Record<string, unknown> = { ...patch };
  if (acted) body.acted_at = new Date().toISOString();
  const { error } = await supabase.from("cb_reels").update(body).eq("id", id);
  if (error) throw error;
}

export async function deleteReel(id: string): Promise<void> {
  const { error } = await supabase.from("cb_reels").delete().eq("id", id);
  if (error) throw error;
}

// ── custom folders ──────────────────────────────────────────────────────────
export async function listFolders(): Promise<Folder[]> {
  const { data, error } = await supabase.from("cb_folders").select("*").order("created_at");
  if (error) throw error;
  return (data || []) as Folder[];
}

export async function createFolder(name: string): Promise<Folder> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const { data, error } = await supabase
    .from("cb_folders")
    .insert({ name: name.trim(), user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export async function addReelToFolder(reelId: string, folderId: string): Promise<void> {
  const { error } = await supabase.from("cb_folder_items").insert({ reel_id: reelId, folder_id: folderId });
  if (error && error.code !== "23505") throw error; // ignore duplicate
}

export async function removeReelFromFolder(reelId: string, folderId: string): Promise<void> {
  const { error } = await supabase.from("cb_folder_items").delete().eq("reel_id", reelId).eq("folder_id", folderId);
  if (error) throw error;
}

// ── per-user MCP key + capture token (issued by the worker) ─────────────────
export interface StudioKey { id: string; key_hint: string; scope: string; created_at: string; last_used_at: string | null; }

async function workerAuthed(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<unknown> {
  const token = await accessToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${WORKER_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status}).`);
  return json;
}

/** Returns the full MCP URL with the plaintext key — shown ONCE. */
export async function issueMcpKey(): Promise<{ url: string; key: string }> {
  return (await workerAuthed("/api/keys", "POST", {})) as { url: string; key: string };
}
export async function listMcpKeys(): Promise<StudioKey[]> {
  const r = (await workerAuthed("/api/keys", "GET")) as { keys: StudioKey[] };
  return r.keys || [];
}
export async function revokeMcpKey(id: string): Promise<void> {
  await workerAuthed(`/api/keys?id=${encodeURIComponent(id)}`, "DELETE");
}
