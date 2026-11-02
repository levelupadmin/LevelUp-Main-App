// QA HARNESS — NOT shipped. Mounts the REAL Stage lesson player
// (src/components/stage/player/StagePlayer.tsx) with Nelson's first 12 lessons
// as they sit on staging, so the phone and laptop layouts can be checked
// without signing in. ChapterViewer owns the data and rules; this only feeds
// the view the props it would hand over.
//   ?as=owner   bought: 3 lessons done, lesson 4 playing at 40% (default)
//   ?as=guest   not bought: free lesson 1, the rest locked, the upsell line
//   ?as=locked  the screen for a lesson they can't open
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import StagePlayer, { StageLocked, type StageSibling } from "@/components/stage/player/StagePlayer";
import "@/index.css";
import "@/styles/stage-fonts.css";
import "@/styles/stage.css";

const ROWS: [string, string, number, boolean][] = [
  ["1a8da2f6", "Introduction: Foundations of Your Filmmaking Journey", 104, true],
  ["b473a6e6", "Redefining Career Paths: Lessons from an Accidental Filmmaker", 206, false],
  ["939eb4d5", "Finding Your Voice", 219, false],
  ["47393fae", "Learning to See Your World Differently", 166, false],
  ["ec9e9dc0", "Watching Cinema with a Filmmaker's Eye", 108, false],
  ["6cbfa01c", "Structuring Stories: Learning from Masters", 151, false],
  ["c2527599", "Prioritizing Story over Stardom: Kolamavu Kokila", 147, false],
  ["479e80df", "Trusting Your Gut: Strengthening Creative Instincts", 92, false],
  ["ed1ca8c2", "Turning Real-Life Observations into Relatable Stories", 136, false],
  ["e52a718d", "Tonal Balancing: Doctor", 257, false],
  ["4d0a90d2", "Previsualization: Seeing Your Story Before You Shoot", 259, false],
  ["3387e8f9", "Guiding New Actors: Techniques for Authentic Performances", 137, false],
];
const SIBLINGS: StageSibling[] = ROWS.map(([id, title, dur, free]) => ({
  id, title, duration_seconds: dur, content_type: "video", thumbnail_url: null,
  vdocipher_thumbnail_url: null, description: null, make_free: free,
}));
const POSTER = "https://d1z78r8i505acl.cloudfront.net/poster/mM8kgWIQ3x4Ao.720.jpeg";

function Harness() {
  const as = new URLSearchParams(location.search).get("as") ?? "owner";
  const owner = as === "owner";
  const idx = owner ? 3 : 0;
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  if (as === "locked") {
    return (
      <StageLocked
        courseTitle="Nelson Dilipkumar Teaches Filmmaking"
        primary={{ label: "Get the course", onClick: () => {} }}
        secondary={{ label: "Back to the course", onClick: () => {} }}
      />
    );
  }
  return (
    <StagePlayer
      grab={{ style: { touchAction: "none" } }}
      showGrab
      loading={false}
      courseTitle="Nelson Dilipkumar Teaches Filmmaking"
      backLabel="Nelson Dilipkumar Teaches Filmmaking"
      onBack={() => {}}
      onShare={() => {}}
      player={
        <div className="relative">
          {/* the wrapper classes ChapterMediaPlayer puts round a VdoCipher lesson */}
          <div className="aspect-video w-full max-w-full rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5 bg-card">
            <img src={POSTER} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
      }
      title={SIBLINGS[idx].title}
      description={owner ? "How to notice the small, specific details in everyday life that make a scene feel true." : null}
      siblings={SIBLINGS}
      currentId={SIBLINGS[idx].id}
      currentIndex={idx}
      progress={owner ? { "1a8da2f6": { done: true, pos: 104 }, b473a6e6: { done: true, pos: 206 }, "939eb4d5": { done: true, pos: 219 }, "47393fae": { done: false, pos: 66 }, ec9e9dc0: { done: false, pos: 40 } } : {}}
      livePct={owner ? 40 : 10}
      done={done}
      busy={false}
      onDone={() => setDone(true)}
      course={owner ? { pct: 10, done: 3, total: 29 } : null}
      owned={owner}
      upsell={owner ? null : { text: `This lesson is free. Get all ${SIBLINGS.length} lessons for ₹2,499.`, label: "Get it", open: () => {} }}
      notes={{ value: notes, onChange: setNotes, saved: notes.length > 0 }}
      about={null}
      resources={owner ? [{ id: "r1", filename: "Lesson notes.pdf", file_url: "#", file_size_bytes: 655360 }] : []}
      qna={<p className="text-sm text-muted-foreground">Q&A renders ChapterQna here.</p>}
      qnaCount={2}
      qnaDot={owner}
      quizzes={null}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <Harness />
  </MemoryRouter>,
);
