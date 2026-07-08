import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, FileText, Link as LinkIcon, Send } from "lucide-react";

interface Props {
  weekId: string;
  userId: string;
  existingSubmissionId?: string;
  compact?: boolean;
  onSubmitted: () => Promise<void> | void;
}

interface PendingFile {
  file: File;
  uploading: boolean;
  uploaded: boolean;
  path?: string;
  error?: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;  // 2 GB
const ACCEPTED =
  "video/mp4,video/quicktime,video/x-matroska,video/webm,image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/mp4,audio/wav,application/zip,application/x-rar-compressed";

export default function AssignmentSubmissionForm({
  weekId,
  userId,
  existingSubmissionId,
  compact = false,
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [openToPeer, setOpenToPeer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const handleFilePick = async (selected: FileList | null) => {
    if (!selected) return;
    const newPending: PendingFile[] = [];
    for (const f of Array.from(selected)) {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: `${f.name} is too large`, description: "Max 2 GB per file", variant: "destructive" });
        continue;
      }
      newPending.push({ file: f, uploading: true, uploaded: false });
    }
    setFiles((prev) => [...prev, ...newPending]);

    // Upload each via TUS (Supabase storage handles large files via tus-resumable)
    for (const pending of newPending) {
      const path = `${userId}/${weekId}/${Date.now()}-${pending.file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("cohort-submissions").upload(path, pending.file, {
        cacheControl: "3600",
        upsert: false,
      });
      setFiles((prev) =>
        prev.map((p) =>
          p.file === pending.file
            ? { ...p, uploading: false, uploaded: !error, path: error ? undefined : path, error: error?.message }
            : p
        )
      );
      if (error) {
        toast({ title: `Couldn't upload ${pending.file.name}`, description: error.message, variant: "destructive" });
      }
    }
  };

  const handleRemove = async (idx: number) => {
    const f = files[idx];
    if (f.path) {
      await supabase.storage.from("cohort-submissions").remove([f.path]);
    }
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!text.trim() && files.length === 0 && !link.trim()) {
      toast({ title: "Add something to submit", description: "Write a note, attach a file, or share a link.", variant: "destructive" });
      return;
    }
    if (files.some((f) => f.uploading)) {
      toast({ title: "Wait for uploads to finish" });
      return;
    }
    setSubmitting(true);
    const fileUrls = files.filter((f) => f.uploaded && f.path).map((f) => f.path!);

    const payload = {
      cohort_week_id: weekId,
      user_id: userId,
      text_content: text.trim() || null,
      file_urls: fileUrls,
      link_url: link.trim() || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      open_to_peer_review: openToPeer,
    };

    const { error } = existingSubmissionId
      ? await supabase.from("cohort_week_submissions").update(payload).eq("id", existingSubmissionId)
      : await supabase.from("cohort_week_submissions").insert(payload);

    setSubmitting(false);
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Submitted", description: "Your mentor will review it." });
    setText("");
    setLink("");
    setFiles([]);
    setOpenToPeer(false);
    await onSubmitted();
  };

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3 bg-cream text-cream-text text-sm font-medium rounded-md hover:-translate-y-0.5 transition-transform"
      >
        <Send className="h-3.5 w-3.5" /> Submit assignment
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Write your submission, notes, or response here…"
        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none resize-y placeholder:text-muted-foreground/60"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 h-10 px-3 border border-dashed border-border bg-surface/50 hover:bg-surface text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors"
        >
          <Upload className="h-3.5 w-3.5" /> Add files (video, PDF, audio…)
        </button>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="…or paste a link (YouTube, Drive, Vimeo)"
          className="h-10 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        onChange={(e) => handleFilePick(e.target.files)}
        className="hidden"
      />

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-surface border border-border rounded-md text-xs">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[160px] truncate">{f.file.name}</span>
              {f.uploading && <Loader2 className="h-3 w-3 animate-spin text-cream" />}
              {f.uploaded && <span className="text-success text-[10px] font-mono">UP</span>}
              {f.error && <span className="text-destructive-text text-[10px] font-mono">ERR</span>}
              <button onClick={() => handleRemove(i)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={openToPeer}
          onChange={(e) => setOpenToPeer(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-xs text-muted-foreground">
          Open to peer review, cohort-mates can see this and offer critique
        </span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSubmit}
          disabled={submitting || files.some((f) => f.uploading)}
          className="inline-flex items-center gap-2 h-10 px-5 bg-cream text-cream-text font-medium rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {existingSubmissionId ? "Resubmit" : "Submit"}
        </button>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
