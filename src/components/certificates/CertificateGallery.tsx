import { useEffect, useState } from "react";
import { Award, Lock, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import CertificateCard from "./CertificateCard";
import CertificateShareMenu from "./CertificateShareMenu";

interface CertificateRow {
  id: string;
  image_url: string;
  certificate_number: string;
  course_name: string;
  created_at: string;
}

interface LockedSlot {
  course_id: string;
  course_name: string;
  thumbnail_url: string | null;
}

interface CertificateGalleryProps {
  userId: string;
}

const ASPECT = "2480 / 1754";

const CertificateGallery = ({ userId }: CertificateGalleryProps) => {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [locked, setLocked] = useState<LockedSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);

      // 1) Earned certificates
      const { data: certData } = await (supabase as any)
        .from("certificates")
        .select("id, image_url, certificate_number, created_at, course_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const certRows = (certData ?? []) as Array<{
        id: string;
        image_url: string;
        certificate_number: string;
        created_at: string;
        course_id: string;
      }>;
      const earnedCourseIds = new Set(certRows.map((r) => r.course_id));

      // 2) Enrolled courses (to build "not yet earned" locked silhouettes).
      //    enrolments → offering_courses → courses.
      const { data: enrs } = await supabase
        .from("enrolments")
        .select("offering_id")
        .eq("user_id", userId)
        .eq("status", "active");
      const offeringIds = [...new Set((enrs ?? []).map((e) => e.offering_id))];

      let enrolledCourseIds: string[] = [];
      if (offeringIds.length) {
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("course_id")
          .in("offering_id", offeringIds);
        enrolledCourseIds = [...new Set((ocs ?? []).map((oc) => oc.course_id))];
      }

      // Course titles + thumbnails for both earned and enrolled courses.
      const allCourseIds = [...new Set([...earnedCourseIds, ...enrolledCourseIds])];
      let courseMap: Record<string, { title: string; thumbnail_url: string | null }> = {};
      if (allCourseIds.length) {
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title, thumbnail_url")
          .in("id", allCourseIds);
        courseMap = Object.fromEntries(
          (courses ?? []).map((c) => [c.id, { title: c.title, thumbnail_url: c.thumbnail_url }])
        );
      }

      if (cancelled) return;

      setCertificates(
        certRows.map((row) => ({
          id: row.id,
          image_url: row.image_url,
          certificate_number: row.certificate_number,
          course_name: courseMap[row.course_id]?.title ?? "Unknown Course",
          created_at: row.created_at,
        }))
      );

      setLocked(
        enrolledCourseIds
          .filter((id) => !earnedCourseIds.has(id))
          .map((id) => ({
            course_id: id,
            course_name: courseMap[id]?.title ?? "In progress",
            thumbnail_url: courseMap[id]?.thumbnail_url ?? null,
          }))
      );

      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: ASPECT, maxWidth: 640 }} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full rounded-xl" style={{ aspectRatio: ASPECT }} />
          ))}
        </div>
      </div>
    );
  }

  // Nothing earned and nothing in progress → clean empty state.
  if (certificates.length === 0 && locked.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Your trophy room is waiting"
        sub="Finish a course to mint your first certificate and start filling your shelf."
        cta={{ label: "Explore programs", to: "/" }}
      />
    );
  }

  const [hero, ...rest] = certificates;

  return (
    <div className="space-y-8">
      {/* Hero: most-recent certificate, presented large like a trophy. */}
      {hero ? (
        <Reveal className="space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-cream" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Latest achievement
            </h2>
          </div>
          <div className="rounded-2xl border border-cream/20 bg-gradient-to-b from-cream/[0.06] to-transparent p-4 sm:p-6">
            <div className="grid sm:grid-cols-[1.6fr_1fr] gap-5 items-center">
              <div
                className="w-full rounded-xl border border-cream/15 overflow-hidden shadow-2xl shadow-black/40"
                style={{ aspectRatio: ASPECT }}
              >
                <img
                  src={hero.image_url}
                  alt={`Certificate for ${hero.course_name}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-xl font-semibold leading-tight">{hero.course_name}</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {hero.certificate_number}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Earned{" "}
                    {new Date(hero.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={hero.image_url}
                    download={`certificate-${hero.certificate_number}.png`}
                    className="btn-champagne pressable inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-sm font-medium"
                  >
                    Download
                  </a>
                  <CertificateShareMenu
                    imageUrl={hero.image_url}
                    courseName={hero.course_name}
                    certificateNumber={hero.certificate_number}
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      ) : (
        // Enrolled but none earned yet, encouraging header above the locked shelf.
        <Reveal className="rounded-2xl border border-border bg-surface p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
            <Award size={22} strokeWidth={1.5} />
          </div>
          <h3 className="font-semibold">No certificates earned yet</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            You have{" "}
            <span className="text-cream font-medium">
              <CountUp value={locked.length} /> {locked.length === 1 ? "course" : "courses"}
            </span>{" "}
            in progress. Reach 100% to unlock your first.
          </p>
        </Reveal>
      )}

      {/* Other earned certificates */}
      {rest.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Earned certificates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rest.map((cert, i) => (
              <Reveal key={cert.id} delayMs={i * 60}>
                <CertificateCard certificate={cert} />
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* Locked silhouettes for not-yet-earned courses */}
      {locked.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Still to unlock
            </h2>
            <span className="text-xs text-muted-foreground">
              {locked.length} {locked.length === 1 ? "course" : "courses"} to go
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {locked.map((slot) => (
              <div
                key={slot.course_id}
                className="relative rounded-xl border border-border bg-surface overflow-hidden"
              >
                <div
                  className="w-full overflow-hidden bg-surface-2"
                  style={{ aspectRatio: ASPECT }}
                >
                  {slot.thumbnail_url ? (
                    <img
                      src={slot.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover grayscale opacity-25"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Award className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas/70 backdrop-blur-sm border border-white/10">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium line-clamp-1 text-muted-foreground">
                    {slot.course_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    Finish to unlock
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <span className="text-cream font-medium">{locked.length} more</span> to unlock
          </p>
        </div>
      )}
    </div>
  );
};

export default CertificateGallery;
