import { CheckCircle2 } from "lucide-react";

interface Props {
  outcomes?: string[] | null;
}

const Outcomes = ({ outcomes }: Props) => {
  if (!outcomes || outcomes.length === 0) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        What you'll learn
      </p>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {outcomes.map((outcome, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-snug">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span className="text-foreground">{outcome}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default Outcomes;
