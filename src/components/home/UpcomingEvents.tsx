import { useNavigate } from "react-router-dom";
import { ChevronRight, Calendar, Clock, Radio, Users, Monitor } from "lucide-react";
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
    time: "7:00 PM IST",
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
    time: "5:00 PM IST",
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
    time: "8:00 PM IST",
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
    time: "6:30 PM IST",
    onlineLabel: "Virtual Session",
    badge: "Live Feedback",
    price: "₹99",
  },
];

const UpcomingEvents = () => {
  const navigate = useNavigate();

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">Upcoming Events</h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
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

      {/* Cards — horizontal scroll */}
      <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-2">
        {upcomingEvents.map((event) => (
          <div
            key={event.id}
            onClick={() => navigate(`/workshops/${event.id}`)}
            className="group relative w-[340px] shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:border-muted-foreground/30 hover:shadow-[0_8px_40px_-12px_hsl(0_0%_100%/0.06)]"
          >
            {/* Image area */}
            <div className="relative h-56 overflow-hidden">
              <img
                src={event.thumbnail}
                alt={event.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />

              {/* Top chips */}
              <div className="absolute left-3.5 top-3.5 flex items-center gap-2">
                <span className="rounded-md bg-foreground/90 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-background backdrop-blur-sm">
                  {event.type}
                </span>
                {event.badge && (
                  <span className="rounded-md bg-card/80 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80 backdrop-blur-sm ring-1 ring-border">
                    {event.badge}
                  </span>
                )}
              </div>

              {/* Price chip */}
              <span className="absolute right-3.5 top-3.5 rounded-md bg-card/80 px-2.5 py-1 font-mono text-xs font-bold text-foreground backdrop-blur-sm ring-1 ring-border">
                {event.price}
              </span>

              {/* Title overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-lg font-bold leading-snug text-foreground drop-shadow-lg">
                  {event.title}
                </h3>
              </div>
            </div>

            {/* Bottom metadata */}
            <div className="flex items-center justify-between px-4 py-3.5">
              {/* Mentor */}
              <div className="flex items-center gap-2.5">
                <img
                  src={event.mentorImage}
                  alt={event.mentor}
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                />
                <span className="text-sm font-medium text-foreground">{event.mentor}</span>
              </div>

              {/* Date + Time + Online */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {event.date}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {event.time}
                </span>
              </div>
            </div>

            {/* Online indicator bar */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <Radio className="h-3 w-3" style={{ color: "hsl(142, 71%, 45%)" }} />
              <span className="text-[11px] font-semibold text-muted-foreground">
                {event.onlineLabel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default UpcomingEvents;
