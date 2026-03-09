import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { trigger_type, user_id, course_id, data } = await req.json();

    // Fetch the user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user_id)
      .single();

    // Fetch matching notification template
    const { data: template } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("trigger_type", trigger_type)
      .eq("is_active", true)
      .or(course_id ? `course_id.eq.${course_id},course_id.is.null` : "course_id.is.null")
      .order("course_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!template) {
      return new Response(
        JSON.stringify({ message: "No active template found", trigger_type }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace template variables
    let body = template.template_body;
    let subject = template.subject || "Notification";
    
    const vars: Record<string, string> = {
      "{{user_name}}": profile?.name || "Learner",
      "{{course_title}}": data?.course_title || "",
      "{{lesson_title}}": data?.lesson_title || "",
      "{{score}}": data?.score?.toString() || "",
      "{{feedback}}": data?.feedback || "",
      "{{date}}": new Date().toLocaleDateString("en-IN"),
      "{{zoom_link}}": data?.zoom_link || "",
    };

    for (const [key, val] of Object.entries(vars)) {
      body = body.replaceAll(key, val);
      subject = subject.replaceAll(key, val);
    }

    // Log the notification (in production, integrate with email/WhatsApp service)
    const { error: insertError } = await supabase
      .from("scheduled_notifications")
      .insert({
        user_id,
        channel: template.channel,
        template_id: template.id,
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Failed to log notification:", insertError);
    }

    console.log(`[${template.channel}] ${trigger_type} notification to ${user_id}: ${subject}`);

    return new Response(
      JSON.stringify({
        success: true,
        trigger_type,
        channel: template.channel,
        subject,
        body_preview: body.substring(0, 100),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
