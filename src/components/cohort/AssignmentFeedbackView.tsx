import { Star, MessageSquare } from "lucide-react";

interface Props {
  status: string;
  feedback: string | null;
  rating: number | null;
}

export default function AssignmentFeedbackView({ status, feedback, rating }: Props) {
  if (!feedback && rating === null) return null;
  return (
    <div className="border border-cream/20 rounded-lg p-4 bg-cream/[0.03]">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-cream" />
        <span className="text-xs font-mono uppercase tracking-widest text-cream">Mentor feedback</span>
        {rating !== null && (
          <div className="ml-auto flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-3.5 w-3.5 ${n <= rating ? "fill-cream text-cream" : "text-muted/30"}`}
              />
            ))}
            <span className="ml-1.5 text-xs font-mono text-foreground">{rating}/5</span>
          </div>
        )}
      </div>
      {feedback && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{feedback}</p>
      )}
    </div>
  );
}
