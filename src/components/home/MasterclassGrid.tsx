import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

import karthikImg from "@/assets/karthik-subbaraj-masterclass.png";
import anthonyImg from "@/assets/anthony-gonsalvez-masterclass.png";
import venketImg from "@/assets/venket-ram.png";
import kiranImg from "@/assets/drk-kiran.webp";
import raviImg from "@/assets/ravi-basrur.webp";
import lokeshImg from "@/assets/lokesh-kanagaraj.png";
import nelsonImg from "@/assets/nelson-dilipkumar.jpg";
import comingSoonImg from "@/assets/coming-soon-silhouette.jpg";

/* Static fallback data matching the main website */
const staticMasterclasses = [
  {
    id: "karthik",
    image: karthikImg,
    name: "Karthik Subbaraj",
    descriptor: "Storytelling to editing to working with actors",
    category: "Filmmaking",
    slug: "karthik-subbaraj",
  },
  {
    id: "anthony",
    image: anthonyImg,
    name: "Anthony Gonsalvez",
    descriptor: "An all-out practical editing experience",
    category: "Editing",
    slug: "anthony-gonsalvez",
  },
  {
    id: "venket",
    image: venketImg,
    name: "G Venket Ram",
    descriptor: "Capturing the perfect image through diverse case studies",
    category: "Photography",
    slug: "g-venket-ram",
  },
  {
    id: "kiran",
    image: kiranImg,
    name: "DRK Kiran",
    descriptor: "Set designing, creative problem-solving, and miniatures",
    category: "Art Direction",
    slug: "drk-kiran",
  },
  {
    id: "ravi",
    image: raviImg,
    name: "Ravi Basrur",
    descriptor: "From the village of Basrur to revolutionizing Sandalwood music",
    category: "Music",
    slug: "ravi-basrur",
  },
  {
    id: "lokesh",
    image: lokeshImg,
    name: "Lokesh Kanagaraj",
    descriptor: "The art and craft of filmmaking",
    category: "Filmmaking",
    slug: "lokesh-kanagaraj",
  },
  {
    id: "nelson",
    image: nelsonImg,
    name: "Nelson Dilipkumar",
    descriptor: "The art of commercial filmmaking",
    category: "Filmmaking",
    slug: "nelson-dilipkumar",
  },
];

const MasterclassCard = ({
  mc,
  onClick,
}: {
  mc: (typeof staticMasterclasses)[0] & { dbSlug?: string };
  onClick: () => void;
}) => {
  const rafId = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (rafId.current) return;
    const card = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafId.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.02)`;
      rafId.current = null;
    });
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    e.currentTarget.style.transform = "";
  };

  return (
    <button
      onClick={onClick}
      className="group relative block w-full text-left transition-transform duration-500 ease-out"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ willChange: "transform" }}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/30 bg-card shadow-design-sm transition-shadow duration-500 group-hover:shadow-design-lg group-hover:border-primary/30">
        <img
          src={mc.image}
          alt={`Portrait of ${mc.name}`}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-sm font-semibold leading-tight text-white sm:text-base">
            {mc.name}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/70 line-clamp-2">
            {mc.descriptor}
          </p>
        </div>
      </div>
    </button>
  );
};

const ComingSoonCard = () => (
  <div className="group relative block">
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/30 shadow-design-sm">
      <img
        src={comingSoonImg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <span className="text-lg md:text-xl font-semibold text-white/80 leading-tight">
          Coming Soon
        </span>
        <p className="text-xs text-white/50 mt-2 leading-relaxed">
          New masterclass dropping soon
        </p>
      </div>
    </div>
  </div>
);

const MasterclassGrid = () => {
  const navigate = useNavigate();

  /* Still try to load DB courses for slug mapping */
  const { data: dbCourses = [] } = useQuery({
    queryKey: ["masterclasses-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, slug, title, thumbnail_url, instructor_name")
        .eq("course_type", "masterclass")
        .eq("status", "published")
        .order("student_count", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  /* Merge: use static images but link to DB slugs if available */
  const masterclasses = staticMasterclasses.map((mc) => {
    const dbMatch = dbCourses.find(
      (c) =>
        c.instructor_name?.toLowerCase().includes(mc.name.split(" ")[0].toLowerCase())
    );
    return { ...mc, dbSlug: dbMatch?.slug };
  });

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <span className="inline-block rounded-full border border-border/50 bg-secondary px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            On-Demand Masterclasses
          </span>
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl tracking-tight">
            India's greatest creative minds.{" "}
            <span className="text-primary">Now your mentors.</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Cinematic, in-depth courses you can start today and revisit forever.
          </p>
        </div>
        <button
          onClick={() => navigate("/explore")}
          className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          View all <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {masterclasses.map((mc) => (
          <MasterclassCard
            key={mc.id}
            mc={mc}
            onClick={() =>
              navigate(`/learn/course/${mc.dbSlug || mc.slug}`)
            }
          />
        ))}
        <ComingSoonCard />
      </div>
    </section>
  );
};

export default MasterclassGrid;
