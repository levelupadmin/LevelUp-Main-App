// Certificate emails go straight out of the LevelUp Google Workspace mailbox
// over SMTP (implicit TLS on 465; Supabase blocks outbound 25 and 587), with
// the PDF attached. No email company sits in between: the sent copy lands in
// that mailbox's Sent folder and replies come back to it.
//
// Secrets: CERT_SMTP_USER (the mailbox), CERT_SMTP_PASSWORD (a Google app
// password for it). Optional: CERT_SMTP_HOST (smtp.gmail.com),
// CERT_SMTP_PORT (465), CERT_EMAIL_FROM_NAME (LevelUp Learning).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export function smtpConfigured(): boolean {
  return !!Deno.env.get("CERT_SMTP_USER") && !!Deno.env.get("CERT_SMTP_PASSWORD");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function certificateEmail(opts: { name: string; course: string; verifyUrl: string }) {
  const first = opts.name.trim().split(/\s+/)[0] || "there";
  const subject = `Your certificate for ${opts.course}`;
  const text = [
    `Hi ${first},`,
    "",
    `Congratulations on completing ${opts.course}. Your certificate is attached.`,
    "",
    `Anyone can check it here: ${opts.verifyUrl}`,
    "",
    "If anything on it is wrong, reply to this email.",
    "",
    "LevelUp Learning",
  ].join("\n");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">` +
    `<p>Hi ${escapeHtml(first)},</p>` +
    `<p>Congratulations on completing <strong>${escapeHtml(opts.course)}</strong>. Your certificate is attached.</p>` +
    `<p>Anyone can check it here: <a href="${escapeHtml(opts.verifyUrl)}">${escapeHtml(opts.verifyUrl.replace(/^https?:\/\//, ""))}</a></p>` +
    `<p>If anything on it is wrong, reply to this email.</p>` +
    `<p>LevelUp Learning</p></div>`;
  return { subject, text, html };
}

export async function sendCertificateEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  pdf: Uint8Array;
  filename: string;
}): Promise<void> {
  const user = Deno.env.get("CERT_SMTP_USER")!;
  const password = Deno.env.get("CERT_SMTP_PASSWORD")!;
  const fromName = Deno.env.get("CERT_EMAIL_FROM_NAME") ?? "LevelUp Learning";
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("CERT_SMTP_HOST") ?? "smtp.gmail.com",
      port: Number(Deno.env.get("CERT_SMTP_PORT") ?? "465"),
      tls: true,
      auth: { username: user, password },
    },
  });
  try {
    await client.send({
      from: `${fromName} <${user}>`,
      to: opts.to,
      replyTo: user,
      subject: opts.subject,
      content: opts.text,
      html: opts.html,
      attachments: [
        { filename: opts.filename, content: opts.pdf, encoding: "binary", contentType: "application/pdf" },
      ],
    });
  } finally {
    try {
      await client.close();
    } catch {
      // The message is already sent (or already failed); a close error changes nothing.
    }
  }
}
