import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Loader2, Upload } from "lucide-react";

import { MorphSheet } from "@/components/motion/MorphSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RoomDemoEntry } from "@/hooks/useRoomDemoDay";
import { useSaveRoomDemoEntry } from "@/hooks/useRoomDemoDay";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ACCEPTED =
  "video/mp4,video/quicktime,video/x-matroska,video/webm,image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/mp4,audio/wav,application/zip,application/x-rar-compressed";

export interface DemoSubmitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offeringId: string;
  batchId: string;
  userId: string;
  existing?: RoomDemoEntry | null;
}

function cleanName(name: string): string {
  return name.replace(/[^\w.-]/g, "_");
}

const DemoSubmitSheet = ({
  open,
  onOpenChange,
  offeringId,
  batchId,
  userId,
  existing,
}: DemoSubmitSheetProps) => {
  const { toast } = useToast();
  const save = useSaveRoomDemoEntry();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workUrl, setWorkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? "");
    setDescription(existing?.description ?? "");
    setWorkUrl(existing?.work_url ?? "");
    setFile(null);
  }, [open, existing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextUrl = workUrl.trim();
    if (!nextTitle) {
      toast({ title: "Give your work a title", variant: "destructive" });
      return;
    }
    if (!nextUrl && !file && (existing?.file_urls.length ?? 0) === 0) {
      toast({ title: "Add a link or a file", variant: "destructive" });
      return;
    }
    if (nextUrl && !/^https?:\/\//i.test(nextUrl)) {
      toast({ title: "Use a full http or https link", variant: "destructive" });
      return;
    }
    if (file && file.size > MAX_FILE_SIZE) {
      toast({ title: `${file.name} is too large`, description: "Max 2 GB per file", variant: "destructive" });
      return;
    }

    let uploadedPath: string | null = null;
    try {
      const fileUrls = [...(existing?.file_urls ?? [])];
      if (file) {
        uploadedPath = `${userId}/demo/${batchId}/${Date.now()}-${cleanName(file.name)}`;
        const { error } = await supabase.storage
          .from("cohort-submissions")
          .upload(uploadedPath, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error(error.message);
        fileUrls.push(uploadedPath);
      }

      await save.mutateAsync({
        id: existing?.id,
        offeringId,
        batchId,
        userId,
        title: nextTitle,
        description: description.trim() || null,
        workUrl: nextUrl || null,
        fileUrls,
      });
      toast({ title: existing ? "Demo entry updated" : "You are on the Demo Day slate" });
      onOpenChange(false);
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from("cohort-submissions").remove([uploadedPath]);
      }
      toast({
        title: "Demo entry did not save",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <MorphSheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? "Edit Demo Day entry" : "Submit to Demo Day"}
      description="Share one finished work with your cohort."
      className="pb-8"
    >
      <form onSubmit={submit} className="mx-auto w-full max-w-xl space-y-5 pt-5">
        <div className="pr-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-room-accent-text">
            The finale
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            {existing ? "Edit your entry." : "Put your work on screen."}
          </h2>
        </div>

        <label className="block space-y-2 text-sm">
          <span>Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={1200}
            placeholder="What did you make, and what should the room notice?"
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Work link</span>
          <Input
            type="url"
            value={workUrl}
            onChange={(event) => setWorkUrl(event.target.value)}
            placeholder="https://"
          />
        </label>

        <div className="rounded-xl border border-dashed border-border p-4">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="focus-ring flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground"
          >
            <Upload size={16} strokeWidth={1.5} aria-hidden />
            {file ? "Choose a different file" : "Add a file instead"}
          </button>
          {file && (
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-foreground">
              <FileText size={14} strokeWidth={1.5} aria-hidden /> {file.name}
            </p>
          )}
        </div>

        <Button type="submit" className="min-h-11 w-full" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {existing ? "Save entry" : "Submit entry"}
        </Button>
      </form>
    </MorphSheet>
  );
};

export default DemoSubmitSheet;
