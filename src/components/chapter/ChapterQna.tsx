import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QnaItem } from "@/components/chapter/types";

interface Props {
  qna: QnaItem[];
  questionText: string;
  setQuestionText: (value: string) => void;
  onPost: () => void;
  submitting: boolean;
  qnaLimit: number;
  setQnaLimit: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * The Q&A / discussion panel for a chapter — ask box + threaded questions with
 * instructor-reply tagging and "show more" paging. Extracted verbatim from
 * ChapterViewer; behaviour unchanged.
 */
export default function ChapterQna({
  qna,
  questionText,
  setQuestionText,
  onPost,
  submitting,
  qnaLimit,
  setQnaLimit,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
            Ask the instructor
          </p>
          {qna.length > 0 && (
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {qna.length} question{qna.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {/* text-base (16px) on mobile to suppress iOS focus auto-zoom;
            text-sm only from sm: up. Same guard as the notes textarea. */}
        <Textarea
          placeholder="What's on your mind about this lesson?"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          rows={3}
          className="text-base sm:text-sm resize-none bg-[hsl(var(--surface))]"
        />
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={onPost}
            disabled={!questionText.trim() || submitting}
            className="btn-champagne px-5 text-[hsl(var(--cream-text))]"
          >
            {submitting ? "Posting…" : "Post question"}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {qna.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-[hsl(var(--surface))]/40 p-6 text-center">
            <p className="text-sm text-foreground/80 font-medium">Nothing yet — be the first.</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[34ch] mx-auto">
              Stuck on a technique? Want a deeper breakdown? The instructor and your fellow students can answer.
            </p>
          </div>
        ) : (
          qna.slice(0, qnaLimit).map((q) => {
            const hasInstructorReply = q.replies.some((r) => r.is_instructor_reply);
            const initial = (q.user_name || "?").slice(0, 1).toUpperCase();
            return (
              <div
                key={q.id}
                className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-surface-2 flex items-center justify-center text-[11px] font-mono font-semibold text-muted-foreground shrink-0">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{q.user_name || "Student"}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(q.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                      {q.is_resolved && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))] border border-[hsl(var(--accent-emerald)/0.3)]">
                          Resolved
                        </span>
                      )}
                      {!q.is_resolved && hasInstructorReply && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[hsl(var(--cream)/0.15)] text-[hsl(var(--cream))] border border-[hsl(var(--cream)/0.3)]">
                          Answered
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {q.question_text}
                    </p>
                  </div>
                </div>
                {q.replies.length > 0 && (
                  <div className="ml-10 space-y-2 pl-3 border-l border-border">
                    {q.replies.map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-md p-2.5 ${
                          r.is_instructor_reply
                            ? "bg-[hsl(var(--cream)/0.08)] border border-[hsl(var(--cream)/0.2)]"
                            : "bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold">
                            {r.is_instructor_reply ? "Instructor" : (r.user_name || "Student")}
                          </span>
                          {r.is_instructor_reply && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]">
                              Staff
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground/70">
                            {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.reply_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {qna.length > qnaLimit && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setQnaLimit((prev) => prev + 20)}
          >
            Show {qna.length - qnaLimit} more question{qna.length - qnaLimit === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </>
  );
}
