import { Users, Menu } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cityCommunities, skillCommunities } from "@/data/communityData";

interface Props {
  onToggleSidebar: () => void;
  onSelectSpace: (type: "city" | "skill", id: string) => void;
}

const SpaceCard = ({
  image,
  name,
  memberCount,
  onClick,
}: {
  image: string;
  name: string;
  memberCount: number;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="relative flex-shrink-0 w-[160px] h-[200px] rounded-xl overflow-hidden group focus:outline-none"
  >
    <img
      src={image}
      alt={name}
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
    />
    <div
      className="absolute inset-0"
      style={{
        background: "linear-gradient(transparent 30%, hsla(0 0% 0% / 0.75) 100%)",
      }}
    />
    <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 group-hover:ring-white/25 transition-all" />
    <div className="absolute bottom-0 left-0 right-0 p-3">
      <p className="text-white font-semibold text-sm text-left">{name}</p>
      <div className="flex items-center gap-1 mt-1" style={{ color: "hsl(0 0% 75%)" }}>
        <Users size={12} />
        <span className="text-[11px]">{memberCount.toLocaleString()} members</span>
      </div>
    </div>
  </button>
);

const SpacesView = ({ onToggleSidebar, onSelectSpace }: Props) => {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <button onClick={onToggleSidebar} className="md:hidden text-muted-foreground">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Spaces</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-8">
          {/* Cities */}
          <section>
            <h2
              className="text-[11px] font-bold uppercase tracking-widest mb-3"
              style={{ color: "hsl(0 0% 45%)" }}
            >
              🏙️ Cities
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {cityCommunities.map((city) => (
                <SpaceCard
                  key={city.id}
                  image={city.image}
                  name={city.name}
                  memberCount={city.memberCount}
                  onClick={() => onSelectSpace("city", city.id)}
                />
              ))}
            </div>
          </section>

          {/* Skills */}
          <section>
            <h2
              className="text-[11px] font-bold uppercase tracking-widest mb-3"
              style={{ color: "hsl(0 0% 45%)" }}
            >
              ✨ Skills
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {skillCommunities.map((skill) => (
                <SpaceCard
                  key={skill.id}
                  image={skill.image}
                  name={skill.name}
                  memberCount={skill.memberCount}
                  onClick={() => onSelectSpace("skill", skill.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpacesView;
