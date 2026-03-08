import { useNavigate } from "react-router-dom";
import { ChevronRight, Calendar, Radio } from "lucide-react";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">Upcoming Events</h2>
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

      {/* Cards */}
      <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-2">
        {upcomingEvents.map((event) => (
          <div
            key={event.id}
            onClick={() => navigate(`/workshops/${event.id}`)}
            className="group relative w-[380px] shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card"
          >
            {/* Full image with gradient overlay — tall poster style */}
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <img
                src={event.thumbnail}
                alt={event.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Gradient overlay — heavier at bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />

              {/* Title area — positioned over image near bottom */}
              <h3 className="absolute bottom-20 left-5 right-5 text-xl font-bold leading-tight text-foreground drop-shadow-lg">
                {event.title}
              </h3>

              {/* Bottom metadata row — over the gradient */}
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-5 pb-5">
                {/* Mentor */}
                <div className="flex items-center gap-2.5">
                  <img
                    src={event.mentorImage}
                    alt={event.mentor}
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.mentor}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Radio className="h-2.5 w-2.5" style={{ color: "hsl(142, 71%, 45%)" }} />
                      <span className="text-[11px] text-muted-foreground">{event.onlineLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Date */}
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
