import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import CertificateShareMenu from "./CertificateShareMenu";

interface Certificate {
  id: string;
  image_url: string;
  certificate_number: string;
  course_name: string;
  created_at: string;
}

interface CertificateCardProps {
  certificate: Certificate;
}

const CertificateCard = ({ certificate }: CertificateCardProps) => {
  const dateEarned = new Date(certificate.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <div
        className="w-full rounded-lg border border-white/10 overflow-hidden"
        style={{ aspectRatio: "2480 / 1754" }}
      >
        <img
          src={certificate.image_url}
          alt={`Certificate for ${certificate.course_name}`}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-white">{certificate.course_name}</h3>
        <p className="text-xs text-white/50 font-mono">{certificate.certificate_number}</p>
        <p className="text-sm text-white/70">Earned on {dateEarned}</p>
      </div>

      <div className="flex items-center gap-2 mt-auto">
        <Button variant="outline" size="sm" asChild className="gap-2">
          <a href={certificate.image_url} download={`certificate-${certificate.certificate_number}.png`}>
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
        <CertificateShareMenu
          imageUrl={certificate.image_url}
          courseName={certificate.course_name}
          certificateNumber={certificate.certificate_number}
        />
      </div>
    </div>
  );
};

export default CertificateCard;
