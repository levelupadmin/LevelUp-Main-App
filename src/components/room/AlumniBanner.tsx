import { Archive } from "lucide-react";

const AlumniBanner = () => (
  <aside className="flex items-start gap-4 rounded-2xl border border-room-accent/25 bg-room-accent/[0.06] p-5">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-room-accent/30 text-room-accent">
      <Archive size={18} strokeWidth={1.5} aria-hidden />
    </span>
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-room-accent-text">Alumni room</p>
      <p className="mt-2 font-serif text-2xl text-foreground">This room stays open. You keep it.</p>
      <p className="body-muted mt-1 text-sm">The feed, people, recordings, resources and Demo Day gallery remain here.</p>
    </div>
  </aside>
);

export default AlumniBanner;
