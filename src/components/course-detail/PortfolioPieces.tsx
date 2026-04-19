import LazyImage from "@/components/LazyImage";

interface PortfolioPiece {
  title: string;
  description?: string | null;
  image_url?: string | null;
}

interface Props {
  pieces?: PortfolioPiece[] | null;
}

const PortfolioPieces = ({ pieces }: Props) => {
  if (!pieces || pieces.length === 0) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        What you'll build
      </p>
      <div className="grid sm:grid-cols-3 gap-4">
        {pieces.map((p, i) => (
          <div key={i} className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="aspect-[4/3] bg-surface-2 relative">
              {p.image_url && (
                <LazyImage src={p.image_url} alt={p.title} className="w-full h-full" />
              )}
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold">{p.title}</h3>
              {p.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PortfolioPieces;
