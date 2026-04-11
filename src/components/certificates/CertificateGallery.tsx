import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import CertificateCard from "./CertificateCard";

interface CertificateRow {
  id: string;
  image_url: string;
  certificate_number: string;
  course_name: string;
  created_at: string;
}

interface CertificateGalleryProps {
  userId: string;
}

const CertificateGallery = ({ userId }: CertificateGalleryProps) => {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCertificates = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("certificates")
        .select("id, image_url, certificate_number, created_at, course_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const courseIds = [...new Set(data.map((r: any) => r.course_id))] as string[];
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", courseIds);
        const courseMap = Object.fromEntries((courses ?? []).map((c) => [c.id, c.title]));

        const mapped = data.map((row: any) => ({
          id: row.id,
          image_url: row.image_url,
          certificate_number: row.certificate_number,
          course_name: courseMap[row.course_id] ?? "Unknown Course",
          created_at: row.created_at,
        }));
        setCertificates(mapped);
      }
      setLoading(false);
    };

    fetchCertificates();
  }, [userId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
            <Skeleton className="w-full rounded-lg" style={{ aspectRatio: "2480 / 1754" }} />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="text-center py-16 text-white/60">
        <p>No certificates earned yet. Complete a course to get your first certificate!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {certificates.map((cert) => (
        <CertificateCard key={cert.id} certificate={cert} />
      ))}
    </div>
  );
};

export default CertificateGallery;
