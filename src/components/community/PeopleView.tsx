import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { directoryCreators } from "@/data/communityData";

interface Props {
  onToggleSidebar: () => void;
}

const PeopleView = ({ onToggleSidebar }: Props) => {
  const [search, setSearch] = useState("");

  const filtered = directoryCreators.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.role.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <button onClick={onToggleSidebar} className="md:hidden text-foreground">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground flex-1">People</h1>
        <span className="text-xs text-muted-foreground">{filtered.length} creators</span>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, role, or city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 mt-2">
        <div className="px-4 pb-8 space-y-2">
          {filtered.map(creator => (
            <div
              key={creator.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-card hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <div className="relative">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={creator.avatar} />
                  <AvatarFallback>{creator.name[0]}</AvatarFallback>
                </Avatar>
                {creator.available && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card" style={{ background: "hsl(var(--success))" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{creator.name}</p>
                <p className="text-xs text-muted-foreground truncate">{creator.role} · {creator.city}</p>
              </div>
              <Badge variant="secondary" className="text-[10px] rounded-full">
                {creator.experienceLevel}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PeopleView;
