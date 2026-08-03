export interface BrevoEmailMessage {
  to: string;
  from?: string;
  senderDomain?: string;
  subject: string;
  html?: string;
  text?: string;
  messageId?: string;
  idempotencyKey?: string;
}

export interface BrevoSendOptions {
  apiKey: string;
  sendUrl?: string;
}

export class BrevoEmailError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "BrevoEmailError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterSeconds(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

function safeHeaderValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[\r\n]+/g, " ").slice(0, 250);
}

export function parseSender(
  from: string | undefined,
  senderDomain = "leveluplearning.in",
): { email: string; name: string } {
  const match = from?.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (match) {
    return {
      name: match[1].trim() || "LevelUp Learning",
      email: match[2],
    };
  }
  if (from && /^[^\s<>]+@[^\s<>]+$/.test(from.trim())) {
    return { name: "LevelUp Learning", email: from.trim() };
  }
  return { name: "LevelUp Learning", email: `noreply@${senderDomain}` };
}

/** Send one rendered transactional message through Brevo's v3 API.
 * Brevo accepts exactly one inline body type, so prefer the rendered HTML and
 * fall back to plain text only when HTML is absent. */
export async function sendBrevoEmail(
  message: BrevoEmailMessage,
  options: BrevoSendOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const sendUrl = options.sendUrl || "https://api.brevo.com/v3/smtp/email";
  const parsedUrl = new URL(sendUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new BrevoEmailError("Brevo send URL must use HTTPS", 500);
  }

  const html = message.html?.trim();
  const text = message.text?.trim();
  if (!html && !text) throw new BrevoEmailError("Email body is empty", 400);

  const customHeaders: Record<string, string> = {};
  const messageId = safeHeaderValue(message.messageId);
  const idempotencyKey = safeHeaderValue(message.idempotencyKey);
  if (messageId) customHeaders["X-Levelup-Message-Id"] = messageId;
  if (idempotencyKey) customHeaders["X-Levelup-Idempotency-Key"] = idempotencyKey;

  const body: Record<string, unknown> = {
    sender: parseSender(message.from, message.senderDomain),
    to: [{ email: message.to }],
    subject: message.subject,
    ...(Object.keys(customHeaders).length > 0 ? { headers: customHeaders } : {}),
    ...(html ? { htmlContent: html } : { textContent: text }),
  };

  const response = await fetchImpl(sendUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": options.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new BrevoEmailError(
      `Brevo request failed with HTTP ${response.status}`,
      response.status,
      retryAfterSeconds(response.headers.get("retry-after")),
    );
  }

  const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
  if (typeof result?.messageId !== "string" || result.messageId.length === 0) {
    throw new BrevoEmailError("Brevo response did not include a messageId", 502);
  }
  return { messageId: result.messageId };
}
