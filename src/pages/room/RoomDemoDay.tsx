import { useMemo, useState } from "react";
import { Film, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import DemoEntryCard from "@/components/room/DemoEntryCard";
import DemoSubmitSheet from "@/components/room/DemoSubmitSheet";
import SessionSlot from "@/components/room/SessionSlot";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomOutlet, useRoomRoster } from "@/hooks/useCohortRooms";
import { useRoomDemoEntries } from "@/hooks/useRoomDemoDay";
import { roomModuleEnabled } from "@/lib/room";

const RoomDemoDay = () => {
  const { room, envelope } = useRoomOutlet();
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const moduleOn = roomModuleEnabled(envelope.config, "demo_day", room.phase);
  const open = moduleOn && (room.phase === "wrap" || room.phase === "alumni");
  const entries = useRoomDemoEntries(room.offering_id, envelope.batch_id, { enabled: open });
  const roster = useRoomRoster(room.offering_id, { enabled: open });

  const demoSession = useMemo(
    () => envelope.sessions.find((session) => session.session_type?.trim().toLowerCase() === "demo_day") ?? null,
    [envelope.sessions],
  );
  const eventEnd = demoSession?.scheduled_at
    ? Date.parse(demoSession.scheduled_at) + (demoSession.duration_minutes || 60) * 60_000
    : null;
  const writable = room.phase === "wrap" && (eventEnd === null || Date.now() <= eventEnd);
  const ownEntry = entries.data?.find((entry) => entry.user_id === user?.id) ?? null;
  const people = new Map((roster.data ?? []).map((person) => [person.user_id, person]));

  if (!moduleOn) {
    return (
      <p className="body-muted py-10 text-center text-sm">
        This cohort doesn&apos;t use Demo Day. <Link to="." className="text-room-accent">Back to the room</Link>
      </p>
    );
  }

  if (!open) {
    return (
      <section className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-room-accent-text">The finale</p>
        <h1 className="mt-4 font-serif text-4xl text-foreground">Demo Day is coming.</h1>
        <p className="body-muted mx-auto mt-3 max-w-md text-sm">The slate opens when this season enters wrap.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="demo-day-title">
      <header className="relative isolate overflow-hidden rounded-2xl border border-border bg-canvas p-6 sm:p-8">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,hsl(var(--room-accent)/0.2),transparent_55%)]" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-room-accent-text">The finale</p>
            <h1 id="demo-day-title" className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">Demo Day.</h1>
            <p className="body-muted mt-3 max-w-xl text-sm">One finished work from every member. The room is the audience.</p>
          </div>
          {writable && user && envelope.batch_id && (
            <Button onClick={() => setSheetOpen(true)} className="min-h-11 gap-2">
              <Sparkles size={16} strokeWidth={1.5} aria-hidden />
              {ownEntry ? "Edit your entry" : "Submit your entry"}
            </Button>
          )}
        </div>
      </header>

      {demoSession && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Headline event</p>
          <SessionSlot session={demoSession} eyebrow="The finale" headingLevel={2} />
        </div>
      )}

      {entries.isPending ? (
        <div className="h-52 animate-pulse rounded-2xl border border-border bg-surface" role="status">
          <span className="sr-only">Loading Demo Day entries</span>
        </div>
      ) : entries.isError ? (
        <p role="alert" className="body-muted py-10 text-center text-sm">The Demo Day slate did not load. Try again shortly.</p>
      ) : (entries.data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center">
          <Film className="mx-auto h-6 w-6 text-room-accent" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 font-serif text-3xl text-foreground">The screening goes on.</p>
          <p className="body-muted mt-2 text-sm">Entries can still land before the event ends.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.data?.map((entry) => {
            const member = people.get(entry.user_id);
            return (
              <DemoEntryCard
                key={entry.id}
                entry={entry}
                memberName={member?.full_name?.trim() || "A member of this room"}
                city={member?.city}
                isOwn={entry.user_id === user?.id && writable}
                onEdit={() => setSheetOpen(true)}
              />
            );
          })}
        </div>
      )}

      {user && envelope.batch_id && (
        <DemoSubmitSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          offeringId={room.offering_id}
          batchId={envelope.batch_id}
          userId={user.id}
          existing={ownEntry}
        />
      )}
    </section>
  );
};

export default RoomDemoDay;
