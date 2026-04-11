import { supabase } from "@/integrations/supabase/client";

export interface VariablePosition {
  key: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  fontWeight: string;
  textAlign: CanvasTextAlign;
  maxWidth: number;
  value?: string; // for custom_text type
}

export interface CertificateVariableValues {
  student_name: string;
  member_id: string;
  batch_number: string;
  course_name: string;
  completion_date: string;
  certificate_number: string;
  [key: string]: string;
}

// Canonical canvas size: A4 landscape at 150 DPI
export const CANVAS_WIDTH = 2480;
export const CANVAS_HEIGHT = 1754;

export const AVAILABLE_VARIABLES: { key: string; label: string }[] = [
  { key: "student_name", label: "Student Name" },
  { key: "member_id", label: "Member ID" },
  { key: "batch_number", label: "Batch Number" },
  { key: "course_name", label: "Course Name" },
  { key: "completion_date", label: "Completion Date" },
  { key: "certificate_number", label: "Certificate Number" },
  { key: "custom_text", label: "Custom Text" },
];

export const DEFAULT_FONT_OPTIONS = {
  fontSize: 48,
  fontFamily: "serif",
  fontColor: "#1a1a1a",
  fontWeight: "bold",
  textAlign: "center" as CanvasTextAlign,
  maxWidth: 800,
};

export const FONT_FAMILIES = [
  "serif",
  "sans-serif",
  "Georgia",
  "Times New Roman",
  "Palatino",
  "Arial",
  "Helvetica",
  "Verdana",
  "monospace",
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load certificate template image"));
    img.src = url;
  });
}

export async function generateCertificateImage(
  templateImageUrl: string,
  variablePositions: VariablePosition[],
  variableValues: CertificateVariableValues
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Draw background
  const bgImg = await loadImage(templateImageUrl);
  ctx.drawImage(bgImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw each variable
  for (const vp of variablePositions) {
    const text = vp.key === "custom_text" ? (vp.value ?? "") : (variableValues[vp.key] ?? "");
    if (!text) continue;

    ctx.font = `${vp.fontWeight} ${vp.fontSize}px ${vp.fontFamily}`;
    ctx.fillStyle = vp.fontColor;
    ctx.textAlign = vp.textAlign;
    ctx.textBaseline = "top";
    ctx.fillText(text, vp.x, vp.y, vp.maxWidth);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create certificate image"))),
      "image/png",
      1.0
    );
  });
}

export async function uploadCertificate(
  blob: Blob,
  userId: string,
  courseId: string
): Promise<string> {
  const path = `${userId}/${courseId}.png`;
  const { error } = await supabase.storage
    .from("certificates")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from("certificates").getPublicUrl(path);
  return data.publicUrl;
}

export async function generateAndSaveCertificate(opts: {
  templateId: string;
  templateImageUrl: string;
  variablePositions: VariablePosition[];
  variableValues: CertificateVariableValues;
  userId: string;
  courseId: string;
  generatedBy: "auto" | "admin_manual";
}): Promise<{ certificateUrl: string; certificateNumber: string } | null> {
  // Check if certificate already exists
  const { data: existing } = await (supabase as any)
    .from("certificates")
    .select("id, image_url, certificate_number")
    .eq("user_id", opts.userId)
    .eq("course_id", opts.courseId)
    .maybeSingle();

  if (existing) return { certificateUrl: existing.image_url, certificateNumber: existing.certificate_number };

  // Get certificate number
  const { data: certNum, error: rpcErr } = await supabase.rpc("next_certificate_number");
  if (rpcErr || !certNum) throw new Error("Failed to generate certificate number");
  const certificateNumber = certNum as string;

  // Generate image
  const blob = await generateCertificateImage(
    opts.templateImageUrl,
    opts.variablePositions,
    { ...opts.variableValues, certificate_number: certificateNumber }
  );

  // Upload
  const imageUrl = await uploadCertificate(blob, opts.userId, opts.courseId);

  // Save to DB
  const { error: insertErr } = await (supabase as any)
    .from("certificates")
    .insert({
      user_id: opts.userId,
      course_id: opts.courseId,
      template_id: opts.templateId,
      image_url: imageUrl,
      certificate_number: certificateNumber,
      generated_by: opts.generatedBy,
      metadata: opts.variableValues,
    });

  if (insertErr) throw new Error(`Failed to save certificate: ${insertErr.message}`);

  return { certificateUrl: imageUrl, certificateNumber };
}
