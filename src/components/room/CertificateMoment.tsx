import { useEffect, useRef } from "react";
import { Award, Film } from "lucide-react";
import { Link } from "react-router-dom";

import CertificateCard from "@/components/certificates/CertificateCard";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomOutlet } from "@/hooks/useCohortRooms";
import { useClaimRoomCertificates, useRoomCertificateData } from "@/hooks/useRoomCertificate";
import { celebrate } from "@/lib/haptics";

const CELEBRATED_PREFIX = "lu_room_certificate_celebrated:";

function celebrateOnce(userId: string, certificateId: string): void {
  const key = `${CELEBRATED_PREFIX}${userId}:${certificateId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // Storage can be unavailable. The moment still renders; avoid blocking it.
  }
  void celebrate();
}

const CertificateMoment = () => {
  const { room } = useRoomOutlet();
  const { user, profile } = useAuth();
  const visible = room.phase === "wrap" || room.phase === "alumni";
  const data = useRoomCertificateData(room.offering_id, user?.id, { enabled: visible });
  const claim = useClaimRoomCertificates();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !data.data || data.data.certificates.length > 0) return;
    const eligible = data.data.courses.filter(
      (course) => course.totalCount > 0 && course.completedCount >= course.totalCount,
    );
    if (eligible.length === 0) return;
    const latch = `${user.id}:${eligible.map((course) => course.id).join(",")}`;
    if (attempted.current === latch) return;
    attempted.current = latch;
    claim.mutate({
      offeringId: room.offering_id,
      userId: user.id,
      studentName: profile?.full_name?.trim() || user.user_metadata?.full_name || "LevelUp member",
      memberNumber: profile?.member_number ?? null,
      courses: eligible,
    });
  }, [claim, data.data, profile, room.offering_id, user]);

  const hero = data.data?.certificates[0] ?? null;
  useEffect(() => {
    if (user && hero) celebrateOnce(user.id, hero.id);
  }, [hero, user]);

  if (!visible) return null;

  return (
    <section aria-labelledby="certificate-moment-title" className="overflow-hidden rounded-2xl border border-room-accent/25 bg-surface">
      <div className="relative isolate px-6 py-8 text-center sm:px-8">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,hsl(var(--room-accent)/0.16),transparent_62%)]" />
        <Award className="mx-auto h-6 w-6 text-room-accent" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-room-accent-text">Completion</p>
        <h2 id="certificate-moment-title" className="mt-3 font-serif text-4xl text-foreground">You finished.</h2>
        <p className="body-muted mx-auto mt-3 max-w-md text-sm">
          One season completed. Your attendance record stays in the room; it does not grade this artifact.
        </p>
      </div>

      <div className="border-t border-border p-4 sm:p-6">
        {data.isPending || claim.isPending ? (
          <div className="h-56 animate-pulse rounded-xl bg-surface-2" role="status">
            <span className="sr-only">Preparing your completion certificate</span>
          </div>
        ) : hero ? (
          <CertificateCard certificate={hero} />
        ) : data.isError || claim.isError ? (
          <div className="py-6 text-center">
            <p className="font-serif text-2xl text-foreground">Your certificate is safe.</p>
            <p className="body-muted mt-2 text-sm">The certificate service is unavailable right now. This room will keep the moment waiting.</p>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="font-serif text-2xl text-foreground">Your completion record is being prepared.</p>
            <p className="body-muted mx-auto mt-2 max-w-md text-sm">Finish the remaining course chapters, then reopen this room to mint the certificate.</p>
            <Link to="screenings" className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-room-accent-text">
              <Film size={15} strokeWidth={1.5} aria-hidden /> Open the Screening Shelf
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default CertificateMoment;
