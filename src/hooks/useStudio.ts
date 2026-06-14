import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as studio from "@/lib/studio";
import type { Bucket, Reel } from "@/lib/studio";
import { toast } from "@/lib/toast";

export function useStudioEnabled() {
  return useQuery({
    queryKey: ["studio", "enabled"],
    queryFn: async () => {
      // Dev-only escape hatch so Studio can be built/previewed without a cohort
      // enrolment. import.meta.env.DEV is statically false in production builds,
      // so this branch is tree-shaken out and never ships.
      if (import.meta.env.DEV && import.meta.env.VITE_STUDIO_DEV_UNLOCK === "true") return true;
      return studio.isStudioEnabled();
    },
    staleTime: 60_000,
  });
}

export function useReels(opts: { bucket?: Bucket | "all"; folderId?: string; q?: string }) {
  return useQuery({
    queryKey: ["studio", "reels", opts],
    queryFn: () => studio.listReels(opts),
    // Keep polling while anything is still transcribing so the UI updates itself.
    refetchInterval: (query) => {
      const data = query.state.data as Reel[] | undefined;
      return data?.some((r) => r.status === "pending" || r.status === "processing") ? 4000 : false;
    },
  });
}

export function useFolders() {
  return useQuery({ queryKey: ["studio", "folders"], queryFn: studio.listFolders });
}

export function useCaptureReel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, bucket }: { url: string; bucket: Bucket }) => studio.captureReel(url, bucket),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "reels"] }),
  });
}

export function useUpdateReel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Reel, "bucket" | "note" | "tags" | "highlights">> }) =>
      studio.updateReel(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "reels"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteReel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studio.deleteReel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "reels"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => studio.createFolder(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "folders"] }),
  });
}
