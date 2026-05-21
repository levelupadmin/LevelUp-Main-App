import { supabase } from "@/integrations/supabase/client";
import { generateAndSaveCertificate, VariablePosition } from "@/lib/certificate-generator";

/**
 * Checks if the student has reached the certificate threshold for a course
 * and auto-generates a certificate if conditions are met.
 */
export async function checkAndGenerateCertificate(
  userId: string,
  courseId: string,
  completedCount: number,
  totalCount: number,
  studentName: string,
  memberNumber: string | null
): Promise<{ certificateUrl: string; certificateNumber: string } | null> {
  if (totalCount === 0) return null;

  const progressPct = Math.round((completedCount / totalCount) * 100);

  // Check if there's an active template with auto_generate enabled
  const { data: template } = await (supabase as any)
    .from("certificate_templates")
    .select("id, background_image_url, variable_positions, completion_threshold, auto_generate, is_active")
    .eq("course_id", courseId)
    .eq("is_active", true)
    .eq("auto_generate", true)
    .maybeSingle();

  if (!template) return null;
  if (progressPct < template.completion_threshold) return null;

  // Check if certificate already exists
  const { data: existing } = await (supabase as any)
    .from("certificates")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (existing) return null;

  // Get course name and batch info
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("id", courseId)
    .maybeSingle();

  // Get batch number from the enrolment that covers THIS course.
  // (The previous .maybeSingle() threw "more than one row" whenever a user
  // had multiple active enrolments, and even on success picked an arbitrary
  // offering — so the batch label printed on the cert was random.)
  // We resolve the offering via offering_courses and pick the user's active
  // enrolment on one of those offerings, preferring the most recent.
  let batchNumber = "";
  const { data: offeringLinks } = await supabase
    .from("offering_courses")
    .select("offering_id")
    .eq("course_id", courseId);
  const offeringIds = (offeringLinks || []).map((o) => o.offering_id).filter(Boolean);
  if (offeringIds.length > 0) {
    const { data: enrolment } = await supabase
      .from("enrolments")
      .select("offering_id, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("offering_id", offeringIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (enrolment?.offering_id) {
      const { data: offering } = await supabase
        .from("offerings")
        .select("title")
        .eq("id", enrolment.offering_id)
        .maybeSingle();
      batchNumber = offering?.title ?? "";
    }
  }

  const variablePositions = (template.variable_positions || []) as VariablePosition[];

  try {
    const result = await generateAndSaveCertificate({
      templateId: template.id,
      templateImageUrl: template.background_image_url,
      variablePositions,
      variableValues: {
        student_name: studentName,
        member_id: memberNumber ? `#${memberNumber}` : "",
        batch_number: batchNumber,
        course_name: course?.title ?? "",
        completion_date: new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        certificate_number: "", // filled by generateAndSaveCertificate
      },
      userId,
      courseId,
      generatedBy: "auto",
    });
    return result;
  } catch (err) {
    if (import.meta.env.DEV) console.error("Auto certificate generation failed:", err);
    return null;
  }
}
