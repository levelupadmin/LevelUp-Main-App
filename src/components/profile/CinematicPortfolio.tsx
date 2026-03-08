import { Heart } from "lucide-react";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseContent from "@/assets/course-content.jpg";

const thumbnails = [courseCinematography, courseEditing, courseContent, courseCinematography];

const portfolioItems = [
  { id: "p1", title: "Golden Hour – Short Film", appreciations: 42 },
  { id: "p2", title: "City Rhythms – Documentary", appreciations: 28 },
  { id: "p3", title: "Monsoon Diaries", appreciations: 15 },
  { id: "p4", title: "Street Food Stories", appreciations: 63 },
];

const CinematicPortfolio = () => (
  <div>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-bold text-foreground">Portfolio</h2>
      <button className="text-xs font-medium text-highlight hover:underline">See all</button>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {portfolioItems.map((p, i) => (
        <div
          key={p.id}
          className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:scale-[1.02] hover:border-highlight/30 hover:shadow-[0_0_20px_hsl(var(--highlight)/0.12)]"
        >
          <div className="relative aspect-[4/3]">
            <img
              src={thumbnails[i % thumbnails.length]}
              alt={p.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            {/* Appreciation pill */}
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
              <Heart className="h-3 w-3 fill-current" /> {p.appreciations}
            </span>
            {/* Title at bottom */}
            <p className="absolute bottom-2 left-2 right-2 text-xs font-semibold text-white line-clamp-2">
              {p.title}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default CinematicPortfolio;
