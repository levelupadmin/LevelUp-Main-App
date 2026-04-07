import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onUploadComplete: (videoId: string) => void;
}

const VdoCipherUploader = ({ onUploadComplete }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setDone(false);

    try {
      // 1. Get upload credentials from edge function
      const { data, error: fnErr } = await supabase.functions.invoke("vdocipher-upload-credential", {
        body: { title: file.name },
      });

      if (fnErr || !data?.clientPayload || !data?.videoId) {
        throw new Error(data?.error || fnErr?.message || "Failed to get upload credentials");
      }

      const { clientPayload, videoId } = data;
      const uploadInfo = clientPayload;

      // 2. Upload directly to VdoCipher's S3 bucket
      const formData = new FormData();
      // Add all policy fields first
      if (uploadInfo["x-amz-credential"]) formData.append("x-amz-credential", uploadInfo["x-amz-credential"]);
      if (uploadInfo["x-amz-algorithm"]) formData.append("x-amz-algorithm", uploadInfo["x-amz-algorithm"]);
      if (uploadInfo["x-amz-date"]) formData.append("x-amz-date", uploadInfo["x-amz-date"]);
      if (uploadInfo["x-amz-signature"]) formData.append("x-amz-signature", uploadInfo["x-amz-signature"]);
      if (uploadInfo.key) formData.append("key", uploadInfo.key);
      if (uploadInfo.policy) formData.append("policy", uploadInfo.policy);
      if (uploadInfo.success_action_status) formData.append("success_action_status", uploadInfo.success_action_status);
      if (uploadInfo.success_action_redirect) formData.append("success_action_redirect", uploadInfo.success_action_redirect);
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 400) resolve();
          else reject(new Error(`Upload failed with status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", uploadInfo.uploadLink || `https://${uploadInfo.bucket}.s3.amazonaws.com`);
        xhr.send(formData);
      });

      setDone(true);
      toast({ title: "Video uploaded to VdoCipher" });
      onUploadComplete(videoId);
    } catch (err: any) {
      console.error("VdoCipher upload error:", err);
      setError(err.message || "Upload failed");
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          ref={fileRef}
          type="file"
          accept="video/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setDone(false);
            setError(null);
          }}
          disabled={uploading}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleUpload}
          disabled={!file || uploading || done}
        >
          <Upload className="h-4 w-4 mr-1" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {uploading && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}

      {done && (
        <p className="flex items-center gap-1 text-xs text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> Upload complete
        </p>
      )}

      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
};

export default VdoCipherUploader;
