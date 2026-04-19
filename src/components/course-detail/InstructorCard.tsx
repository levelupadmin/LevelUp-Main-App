import InitialsAvatar from "@/components/InitialsAvatar";
import { ExternalLink } from "lucide-react";

interface InstructorLink {
  label: string;
  url: string;
}

interface Props {
  name?: string | null;
  bio?: string | null;
  credentials?: string[] | null;
  avatarUrl?: string | null;
  links?: InstructorLink[] | null;
}

const InstructorCard = ({ name, bio, credentials, avatarUrl, links }: Props) => {
  // Hide the whole section if we don't have at least a bio or credentials
  // — just a name is not enough to justify an "About the instructor" block.
  const hasContent = bio || (credentials && credentials.length > 0);
  if (!hasContent || !name) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Meet your instructor
      </p>
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col sm:flex-row gap-5">
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
          ) : (
            <InitialsAvatar name={name} size={80} />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <h3 className="text-lg font-semibold">{name}</h3>
          {bio && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {bio}
            </p>
          )}
          {credentials && credentials.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {credentials.map((c, i) => (
                <li
                  key={i}
                  className="text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]"
                >
                  {c}
                </li>
              ))}
            </ul>
          )}
          {links && links.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-1">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-cream hover:underline"
                >
                  {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default InstructorCard;
