import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, UploadCloud } from "lucide-react";

interface Props {
  /** Called with the stored object key once the upload finishes. The caller
   *  should set the chapter's media_url = key and media_provider = 'supabase-signed'. */
  onUploaded: (key: string) => void;
  courseId?: string;
  /** true once this chapter already holds a protected upload */
  alreadyProtected?: boolean;
}

/**
 * Uploads a video straight into the PRIVATE protected-video bucket via a
 * one-time signed upload URL (minted by the admin-only get-video-upload-url
 * function). The file never gets a public URL, so it's download-protected from
 * the moment it lands — playback later goes through get-video-src. This is the
 * default path that makes "upload a video" mean "protected video".
 */
export default function ProtectedVideoUploader({ onUploaded, courseId, alreadyProtected }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-video-upload-url", {
        body: { filename: file.name, course_id: courseId },
      });
      const signed = (data as { signedUrl?: string; token?: string; path?: string } | null) || null;
      if (error || !signed?.token || !signed?.path) {
        throw new Error("Couldn't start the upload. Are you signed in as an admin?");
      }

      const { error: upErr } = await supabase.storage
        .from("protected-video")
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (upErr) throw upErr;

      setDone(true);
      onUploaded(signed.path);
      toast({ title: "Video uploaded — download-protected" });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {(alreadyProtected || done) && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Protected video attached (no public link, download blocked)
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          disabled={uploading}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setDone(false);
          }}
          className="text-xs"
        />
        <button
          type="button"
          onClick={upload}
          disabled={!file || uploading}
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Upload protected"}
        </button>
      </div>
      {uploading && (
        <p className="text-xs text-muted-foreground">
          Uploading privately… large files can take a few minutes — keep this tab open.
        </p>
      )}
    </div>
  );
}
