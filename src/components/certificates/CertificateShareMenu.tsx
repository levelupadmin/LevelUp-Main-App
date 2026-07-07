import { useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Share2, ExternalLink, Copy, Link2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { generateShareCard, shareCertificateImage } from "@/lib/certificate-generator";

interface CertificateShareMenuProps {
  imageUrl: string;
  courseName: string;
  certificateNumber: string;
  /**
   * Optional custom trigger (e.g. the champagne Share button in
   * CertificateCard). When omitted, a self-contained outline "Share" button is
   * rendered — this is the shape CertificateGallery uses, kept back-compatible.
   */
  children?: ReactNode;
}

const CertificateShareMenu = ({
  imageUrl,
  courseName,
  certificateNumber,
  children,
}: CertificateShareMenuProps) => {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const encodedUrl = encodeURIComponent(imageUrl);

  // Primary action: render the share card and hand it to the OS/Web share sheet
  // (the same File-based path InvoiceDetailSheet uses). The intent-link menu is
  // only opened when no native/web share surface exists (e.g. desktop Chrome).
  const attemptShare = async () => {
    if (sharing) return;
    setSharing(true);
    void hapticImpact("light");
    try {
      const blob = await generateShareCard({
        courseName,
        studentName: profile?.full_name ?? "",
      });
      const result = await shareCertificateImage({
        blob,
        fileName: `levelup-certificate-${certificateNumber}.png`,
        courseName,
        imageUrl,
      });
      if (result === "unavailable") setOpen(true);
      else if (result === "shared") void hapticNotification("success");
    } catch {
      // Card generation or the share call failed — always leave the user a path.
      setOpen(true);
    } finally {
      setSharing(false);
    }
  };

  const handleLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      "_blank"
    );
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(
      `I just earned my certificate for '${courseName}' from @LevelUpLearning! 🎓 #LevelUpLearning #certificate`
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`,
      "_blank"
    );
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `I just completed ${courseName} on LevelUp! Check out my certificate: ${imageUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleInstagram = () => {
    navigator.clipboard.writeText(imageUrl);
    toast("Link copied! Share it in your Instagram story");
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(imageUrl);
    toast("Certificate link copied!");
  };

  // The trigger both invokes the smart-share attempt AND anchors the fallback
  // menu. Opening is driven by attemptShare (not the trigger's own click), so a
  // successful native share never flashes the menu; onOpenChange only closes.
  const defaultTrigger = (
    <Button
      variant="outline"
      size="sm"
      haptic={false}
      disabled={sharing}
      onClick={attemptShare}
      className="gap-2 min-h-[44px]"
    >
      <Share2 className="h-4 w-4" />
      Share
    </Button>
  );

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ onClick?: () => void; disabled?: boolean }>, {
        onClick: attemptShare,
        disabled: sharing,
      })
    : defaultTrigger;

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleLinkedIn} className="gap-2 cursor-pointer">
          <ExternalLink className="h-4 w-4" />
          LinkedIn
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTwitter} className="gap-2 cursor-pointer">
          <ExternalLink className="h-4 w-4" />
          Twitter / X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleWhatsApp} className="gap-2 cursor-pointer">
          <ExternalLink className="h-4 w-4" />
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleInstagram} className="gap-2 cursor-pointer">
          <Copy className="h-4 w-4" />
          Instagram
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} className="gap-2 cursor-pointer">
          <Link2 className="h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CertificateShareMenu;
