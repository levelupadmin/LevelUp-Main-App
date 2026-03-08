import { useNavigate } from "react-router-dom";
import { ChevronRight, Calendar, Radio, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseContent from "@/assets/course-content.jpg";
import heroFilmmaking from "@/assets/hero-filmmaking.jpg";

const upcomingEvents = [
  {
    id: "e1",
    title: "AI Filmmaking Bootcamp: From Prompt to Screen",
    type: "Masterclass",
    mentor: "Kripakaran",
    mentorImage: instructor1,
    thumbnail: heroFilmmaking,
    date: "Sat, Mar 14",
    targetDate: new Date("2026-03-14T10:00:00"),
    onlineLabel: "Live on Zoom",
    badge: "Limited Seats",
    price: "₹199",
  },
  {
    id: "e2",
    title: "Edit Better Reels in 60 Minutes",
    type: "Workshop",
    mentor: "Priya Sharma",
    mentorImage: instructor2,
    thumbnail: courseEditing,
    date: "Sun, Mar 16",
    targetDate: new Date("2026-03-16T14:00:00"),
    onlineLabel: "Online Event",
    badge: "Beginner Friendly",
    price: "Free",
  },
  {
    id: "e3",
    title: "Creator AMA with Industry Editors",
    type: "AMA",
    mentor: "Rajiv Menon",
    mentorImage: instructor1,
    thumbnail: courseCinematography,
    date: "Tue, Mar 18",
    targetDate: new Date("2026-03-18T18:00:00"),
    onlineLabel: "Live on Zoom",
    badge: "Recording Available",
    price: "Free",
  },
  {
    id: "e4",
    title: "How to Build a Portfolio That Gets You Hired",
    type: "Webinar",
    mentor: "Sneha Patel",
    mentorImage: instructor2,
    thumbnail: courseContent,
    date: "Fri, Mar 21",
    targetDate: new Date("2026-03-21T16:00:00"),
    onlineLabel: "Virtual Session",
    badge: "Live Feedback",
    price: "₹99",
  },
];

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(target.getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setDiff(target.getTime() - Date.now()), 60000);
    return () => clearInterval(t);
  }, [target]);
  if (diff <= 0) return "Live now";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

const CountdownBadge = ({ target }: { target: Date }) => {
  const label = useCountdown(target);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-highlight/15 px-2.5 py-1 font-mono text-[10px] font-bold text-highlight">
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
};

const UpcomingEvents = () => {
  const navigate = useNavigate();

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-highlight" />
            <h2 className="text-xl font-bold text-foreground">Upcoming Events</h2>
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Join live online sessions, workshops and creator conversations led by mentors, industry professionals and the Level Up community.
          </p>
        </div>
        <button
          onClick={() => navigate("/learn/workshops")}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          View all events
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-2">
        {upcomingEvents.map((event) => (
          <div
            key={event.id}
            onClick={() => navigate(`/workshops/${event.id}`)}
            className="group relative w-[380px] shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-muted-foreground/20 hover:shadow-[0_0_0_1px_hsl(var(--highlight)/0.08)]"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img
                src={event.thumbnail}
                alt={event.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />

              {/* Countdown badge */}
              <div className="absolute top-4 right-4">
                <CountdownBadge target={event.targetDate} />
              </div>

              <h3 className="absolute bottom-20 left-5 right-5 text-xl font-bold leading-tight text-foreground drop-shadow-lg">
                {event.title}
              </h3>

              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-5 pb-5">
                <div className="flex items-center gap-2.5">
                  <img
                    src={event.mentorImage}
                    alt={event.mentor}
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.mentor}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Radio className="h-2.5 w-2.5 text-success" />
                      <span className="text-[11px] text-muted-foreground">{event.onlineLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {event.date}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default UpcomingEvents;
