import { Share2, ExternalLink, Copy, Link2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CertificateShareMenuProps {
  imageUrl: string;
  courseName: string;
  certificateNumber: string;
}

const CertificateShareMenu = ({
  imageUrl,
  courseName,
  certificateNumber,
}: CertificateShareMenuProps) => {
  const encodedUrl = encodeURIComponent(imageUrl);

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DropdownMenuTrigger>
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
