import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDay } from "@/lib/certificates";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import "@/components/certificates/certificate.css";

/**
 * Public check page (/v/:code), what the QR on every certificate opens.
 * Anyone can confirm a certificate is real: name, program, completion date,
 * number and whether it's still valid. Nothing else about the person shows.
 */
interface VerifyRow {
  certificate_number: string;
  name_on_certificate: string | null;
  course_title: string;
  program_title: string | null;
  completed_on: string | null;
  issued_at: string;
  status: "valid" | "revoked";
  revoked_at: string | null;
}

export default function VerifyCertificate() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const clean = code.trim().toUpperCase();
  // Fetched directly, not through the shared query cache: for a signed-out
  // visitor AuthContext clears that cache as it settles, which cancels any
  // lookup in flight and would leave this page on "Checking…".
  const [data, setData] = useState<VerifyRow | null>(null);
  const [isLoading, setIsLoading] = useState(clean.length >= 6);

  useEffect(() => {
    if (clean.length < 6) {
      setIsLoading(false);
      return;
    }
    let live = true;
    setIsLoading(true);
    void (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: VerifyRow[] | null; error: unknown }>;
    })
      .rpc("verify_certificate", { p_code: clean })
      .then(({ data: rows }) => {
        if (live) setData(rows?.[0] ?? null);
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [clean]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = typed.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (next.length >= 6) navigate(`/v/${next}`);
  };

  return (
    <main className="cert-verify">
      <div className="cert-verify-card">
        <LevelUpWordmark className="h-7 w-auto" />
        {!clean ? (
          <form onSubmit={submit}>
            <p className="cert-verify-foot">Enter the check code printed under the QR on the certificate.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="7KQ2M9XP" aria-label="Check code" maxLength={16} />
            <button type="submit">Check certificate</button>
          </form>
        ) : isLoading ? (
          <p className="cert-verify-foot">Checking…</p>
        ) : !data ? (
          <>
            <span className="cert-verify-badge bad"><ShieldAlert size={18} /> No certificate found</span>
            <p className="cert-verify-foot">
              We couldn't find a certificate with the code {clean}. Check the code and try again, or write to admin@leveluplearning.in.
            </p>
          </>
        ) : (
          <>
            {data.status === "valid" ? (
              <span className="cert-verify-badge ok"><BadgeCheck size={18} /> Genuine LevelUp Learning certificate</span>
            ) : (
              <span className="cert-verify-badge bad"><ShieldAlert size={18} /> This certificate was cancelled</span>
            )}
            <p className="cert-verify-name">{data.name_on_certificate}</p>
            <dl>
              <div><dt>Program</dt><dd>{data.program_title ?? data.course_title}</dd></div>
              {data.completed_on && <div><dt>Completed</dt><dd>{formatDay(data.completed_on)}</dd></div>}
              <div><dt>Certificate number</dt><dd>{data.certificate_number}</dd></div>
              <div><dt>Issued</dt><dd>{formatDay(data.issued_at)}</dd></div>
              {data.status === "revoked" && data.revoked_at && <div><dt>Cancelled</dt><dd>{formatDay(data.revoked_at)}</dd></div>}
            </dl>
            <p className="cert-verify-foot">Issued by LevelUp Learning, leveluplearning.in</p>
          </>
        )}
      </div>
    </main>
  );
}
