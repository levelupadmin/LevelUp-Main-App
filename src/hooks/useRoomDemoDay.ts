import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

interface DbResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

interface SelectQuery<T> extends PromiseLike<DbResult<T>> {
  eq: (column: string, value: string) => SelectQuery<T>;
  order: (column: string, options: { ascending: boolean }) => SelectQuery<T>;
}

interface DemoTable {
  select: (columns: string) => SelectQuery<RoomDemoEntryRow[]>;
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => PromiseLike<DbResult<unknown>>;
}

const demoDb = supabase as unknown as {
  from: (table: "cohort_demo_entries") => DemoTable;
};

export interface RoomDemoFile {
  path: string;
  name: string;
  signedUrl: string | null;
}

export interface RoomDemoEntryRow {
  id: string;
  offering_id: string;
  batch_id: string;
  user_id: string;
  title: string;
  description: string | null;
  work_url: string | null;
  file_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface RoomDemoEntry extends RoomDemoEntryRow {
  files: RoomDemoFile[];
}

export interface SaveRoomDemoEntry {
  id?: string;
  offeringId: string;
  batchId: string;
  userId: string;
  title: string;
  description: string | null;
  workUrl: string | null;
  fileUrls: string[];
}

const demoKey = (offeringId: string | null | undefined, batchId: string | null | undefined) =>
  ["cohort-rooms", "demo-day", offeringId ?? null, batchId ?? null] as const;

function fileName(path: string): string {
  const leaf = path.split("/").pop() || "Demo file";
  try {
    return decodeURIComponent(leaf.replace(/^\d+-/, ""));
  } catch {
    return leaf.replace(/^\d+-/, "");
  }
}

async function fetchDemoEntries(offeringId: string, batchId: string | null): Promise<RoomDemoEntry[]> {
  let query = demoDb
    .from("cohort_demo_entries")
    .select("id,offering_id,batch_id,user_id,title,description,work_url,file_urls,created_at,updated_at")
    .eq("offering_id", offeringId);
  if (batchId) query = query.eq("batch_id", batchId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw Object.assign(new Error(error.message || "Demo Day did not load"), error);

  return Promise.all(
    (data ?? []).map(async (entry) => {
      const files = await Promise.all(
        (entry.file_urls ?? []).map(async (path) => {
          const { data: signed } = await supabase.storage
            .from("cohort-submissions")
            .createSignedUrl(path, 60 * 60);
          return { path, name: fileName(path), signedUrl: signed?.signedUrl ?? null };
        }),
      );
      return { ...entry, file_urls: entry.file_urls ?? [], files };
    }),
  );
}

export function useRoomDemoEntries(
  offeringId: string | null | undefined,
  batchId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: demoKey(offeringId, batchId),
    queryFn: () => fetchDemoEntries(offeringId as string, batchId ?? null),
    enabled: !!offeringId && options?.enabled !== false,
    staleTime: 30_000,
  });
}

export function useSaveRoomDemoEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: SaveRoomDemoEntry) => {
      const payload: Record<string, unknown> = {
        offering_id: entry.offeringId,
        batch_id: entry.batchId,
        user_id: entry.userId,
        title: entry.title,
        description: entry.description,
        work_url: entry.workUrl,
        file_urls: entry.fileUrls,
      };
      if (entry.id) payload.id = entry.id;

      const { error } = await demoDb.from("cohort_demo_entries").upsert(payload, {
        onConflict: "batch_id,user_id",
      });
      if (error) {
        const friendly = error.code === "23505"
          ? "You already have a Demo Day entry. Open it to edit."
          : error.message || "Your Demo Day entry did not save.";
        throw Object.assign(new Error(friendly), error);
      }
      return entry;
    },
    onSuccess: (entry) => {
      track({ name: "room_demo_entry_submitted" });
      void queryClient.invalidateQueries({ queryKey: demoKey(entry.offeringId, entry.batchId) });
    },
  });
}
