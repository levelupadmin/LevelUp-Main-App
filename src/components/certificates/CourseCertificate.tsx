import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Copy, Download, Mail } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  callCertificates,
  downloadCertificate,
  formatDay,
  type StudentCertificateView,
} from "@/lib/certificates";
import CertificatePreview from "./CertificatePreview";
import "./certificate.css";

/**
 * The certificate block on the course page. One call (`status`) says where
 * the student stands; every button goes back to the certificates function,
 * which enforces the rules (85%, 2 re-sends in 48 hours, 10 downloads a day).
 */
const SUPPORT_EMAIL = "admin@leveluplearning.in";

const certificateStatusKey = (courseId: string) => ["certificate-status", courseId] as const;

export default function CourseCertificate({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { data: view, isLoading } = useQuery({
    queryKey: certificateStatusKey(courseId),
    queryFn: () => callCertificates<StudentCertificateView>({ action: "status", course_id: courseId }),
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);

  if (isLoading || !view || !view.ready) return null;
  const cert = view.certificate;
  const refresh = (next?: StudentCertificateView) => {
    if (next) qc.setQueryData(certificateStatusKey(courseId), next);
    else void qc.invalidateQueries({ queryKey: certificateStatusKey(courseId) });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = e as Error & { data?: { view?: StudentCertificateView } | null };
      setError(err.message);
      if (err.data?.view) refresh(err.data.view);
    } finally {
      setBusy(null);
    }
  };

  const claim = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter your full name as it should appear.");
      return;
    }
    void run("claim", async () => {
      const r = await callCertificates<{ result: string; email?: string; view: StudentCertificateView }>({
        action: "claim",
        course_id: courseId,
        name: name.trim(),
        email: email.trim() || undefined,
      });
      refresh(r.view);
      setClaiming(false);
      toast.success(r.email === "sent" ? "Certificate ready. We've emailed it to you." : "Certificate ready. Download it below.");
    });
  };

  const resend = (e?: FormEvent) => {
    e?.preventDefault();
    void run("resend", async () => {
      const r = await callCertificates<{ email: string; view: StudentCertificateView }>({
        action: "resend",
        course_id: courseId,
        email: email.trim() || undefined,
      });
      refresh(r.view);
      setAskEmail(false);
      if (r.email === "sent") toast.success("Sent. Check your inbox in a minute.");
      else if (r.email === "no_email") setAskEmail(true);
      else toast.message("We've queued it. It goes out shortly.");
    });
  };

  const copyLink = async () => {
    if (!cert?.verify_url) return;
    try {
      await navigator.clipboard.writeText(cert.verify_url);
      toast.success("Check link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  // ── Issued ─────────────────────────────────────────────────────────
  if (cert) {
    if (cert.status === "revoked") {
      return (
        <section className="cert-card" aria-label="Certificate">
          <div className="cert-card-head">
            <Award className="ic" />
            <div>
              <h2 className="cert-card-title">Certificate cancelled</h2>
              <p className="cert-card-sub">This certificate is no longer valid. Questions? Write to {SUPPORT_EMAIL}.</p>
            </div>
          </div>
        </section>
      );
    }
    const emailLine =
      cert.email_status === "sent" && cert.email_to
        ? `Emailed to ${cert.email_to} on ${formatDay(cert.last_emailed_at)}.`
        : cert.email_status === "no_email"
          ? "Add an email and we'll send you a copy."
          : cert.email_status === "failed"
            ? "We couldn't email it. Download it here, or try again."
            : cert.email_status === "waiting"
              ? "Your email copy goes out shortly."
              : cert.email_status === "skipped"
                ? "This test site doesn't send email to this address."
                : "";
    return (
      <section className="cert-card" aria-label="Your certificate">
        <div className="cert-card-head">
          <Award className="ic" />
          <div>
            <h2 className="cert-card-title">Your certificate</h2>
            <p className="cert-card-sub">
              {cert.number}
              {cert.completed_on ? ` · completed ${formatDay(cert.completed_on)}` : ""}
            </p>
          </div>
        </div>
        <div className="cert-card-body">
          <div className="cert-card-actions">
            <button type="button" className="btn btn--md" disabled={busy === "download"} onClick={() => run("download", () => downloadCertificate(cert.id))}>
              <Download className="ic" /> {busy === "download" ? "Getting it…" : "Download PDF"}
            </button>
            <button
              type="button"
              className="btn btn--md btn--secondary"
              disabled={busy === "resend"}
              onClick={() => (cert.email_status === "no_email" || !view.has_email ? setAskEmail(true) : resend())}
            >
              <Mail className="ic" /> {busy === "resend" ? "Sending…" : "Email it to me"}
            </button>
            {cert.verify_url && (
              <button type="button" className="btn btn--md btn--secondary" onClick={copyLink}>
                <Copy className="ic" /> Copy check link
              </button>
            )}
          </div>
          {askEmail && (
            <form className="cert-form" onSubmit={resend}>
              <label>
                Where should we email it?
                <input type="email" inputMode="email" autoComplete="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn--md" disabled={busy === "resend"}>Send it</button>
            </form>
          )}
          {error && <p className="cert-card-error" role="alert">{error}</p>}
          {emailLine && <p className="cert-card-note">{emailLine}</p>}
          <p className="cert-card-note">
            {cert.resends_left > 0
              ? `You can ask for the email ${cert.resends_left === 1 ? "once more" : "twice"} in the next 48 hours.`
              : cert.next_resend_at
                ? `You can ask for the email again after ${new Date(cert.next_resend_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Downloading still works.`
                : ""}{" "}
            Name wrong? Reply to the certificate email or write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
        {cert.render && (
          <div className="cert-card-art">
            <CertificatePreview
              imageUrl={cert.render.image_url}
              width={cert.render.width}
              height={cert.render.height}
              fields={cert.render.fields}
              values={cert.render.values}
              alt={`Certificate for ${cert.name ?? "you"}`}
            />
          </div>
        )}
      </section>
    );
  }

  // ── Not issued yet ────────────────────────────────────────────────
  if (view.mode === "manual") {
    return (
      <section className="cert-card" aria-label="Certificate">
        <div className="cert-card-head">
          <Award className="ic" />
          <div>
            <h2 className="cert-card-title">Certificate</h2>
            <p className="cert-card-sub">The LevelUp team sends your certificate when the program ends. It'll show up here and in your email.</p>
          </div>
        </div>
      </section>
    );
  }

  if (!view.eligible) {
    const left = Math.max(0, view.needed - view.done);
    return (
      <section className="cert-card" aria-label="Certificate">
        <div className="cert-card-head">
          <Award className="ic" />
          <div>
            <h2 className="cert-card-title">Certificate</h2>
            <p className="cert-card-sub">
              Finish {view.needed} of {view.total} lessons ({view.threshold}%) to get your certificate.{" "}
              {left > 0 ? `${left} to go.` : ""}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cert-card" aria-label="Get your certificate">
      <div className="cert-card-head">
        <Award className="ic" />
        <div>
          <h2 className="cert-card-title">You've earned your certificate</h2>
          <p className="cert-card-sub">You finished {view.done} of {view.total} lessons. Get it as a PDF, and we'll email you a copy.</p>
        </div>
      </div>
      <div className="cert-card-body">
        {!claiming ? (
          <div className="cert-card-actions">
            <button
              type="button"
              className="btn btn--md"
              onClick={() => {
                setName(view.name_ok ? (view.profile_name ?? "") : "");
                setClaiming(true);
              }}
            >
              <Award className="ic" /> Get my certificate
            </button>
          </div>
        ) : (
          <form className="cert-form" onSubmit={claim}>
            <label>
              Your name, as it should appear
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required />
              <span className="hint">Check the spelling. This is printed on the certificate.</span>
            </label>
            {!view.has_email && (
              <label>
                Email for your copy (optional)
                <input type="email" inputMode="email" autoComplete="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            )}
            <button type="submit" className="btn btn--md" disabled={busy === "claim"}>
              {busy === "claim" ? "Making your certificate…" : "Get my certificate"}
            </button>
          </form>
        )}
        {error && <p className="cert-card-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
