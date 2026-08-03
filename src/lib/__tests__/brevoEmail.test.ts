import { describe, expect, it, vi } from "vitest";
import {
  parseSender,
  sendBrevoEmail,
} from "../../../supabase/functions/_shared/brevo";

describe("Brevo transactional sender", () => {
  it("parses the configured LevelUp sender", () => {
    expect(parseSender("LevelUp Learning <noreply@leveluplearning.in>")).toEqual({
      name: "LevelUp Learning",
      email: "noreply@leveluplearning.in",
    });
  });

  it("sends one HTML body with trace headers and never exposes the API key in the body", async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        sender: { name: "LevelUp Learning", email: "noreply@leveluplearning.in" },
        to: [{ email: "learner@example.com" }],
        subject: "Welcome",
        htmlContent: "<p>Hello</p>",
        headers: {
          "X-Levelup-Message-Id": "message-1",
          "X-Levelup-Idempotency-Key": "welcome:user-1:message-1",
        },
      });
      expect(body).not.toHaveProperty("textContent");
      expect(String(init?.body)).not.toContain("test-api-key");
      expect(new Headers(init?.headers).get("api-key")).toBe("test-api-key");
      return new Response(JSON.stringify({ messageId: "brevo-message-1" }), { status: 201 });
    });

    await expect(sendBrevoEmail({
      to: "learner@example.com",
      from: "LevelUp Learning <noreply@leveluplearning.in>",
      subject: "Welcome",
      html: "<p>Hello</p>",
      text: "Hello",
      messageId: "message-1",
      idempotencyKey: "welcome:user-1:message-1",
    }, { apiKey: "test-api-key" }, request as typeof fetch)).resolves.toEqual({
      messageId: "brevo-message-1",
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("preserves provider status and Retry-After for worker backoff", async () => {
    const request = vi.fn(async () => new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "45" },
    }));

    await expect(sendBrevoEmail({
      to: "learner@example.com",
      subject: "Welcome",
      html: "<p>Hello</p>",
    }, { apiKey: "test-api-key" }, request as typeof fetch)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 45,
    });
  });
});
