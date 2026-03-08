import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { mockAdminWorkshops, WorkshopStatus } from "@/data/adminData";
import { Clapperboard, Search, Plus, MoreHorizontal, MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const statusStyles: Record<WorkshopStatus, string> = {
  upcoming: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  live: "bg-green-500/10 text-green-400 border-green-500/20",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const AdminWorkshops = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workshopStatuses, setWorkshopStatuses] = useState<Record<string, WorkshopStatus>>(
    Object.fromEntries(mockAdminWorkshops.map((w) => [w.id, w.status]))
  );

  const workshops = mockAdminWorkshops
    .filter((w) => !isSuperAdmin ? w.instructorId === "u2" : true)
    .filter((w) => search === "" || w.title.toLowerCase().includes(search.toLowerCase()))
    .filter((w) => statusFilter === "all" || workshopStatuses[w.id] === statusFilter);

  const handleCancel = (id: string) => {
    setWorkshopStatuses((s) => ({ ...s, [id]: "cancelled" }));
    toast({ title: "Workshop cancelled" });
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workshop Management</h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin ? "Schedule and manage all workshops" : "Your workshops"}
            </p>
          </div>
          <Button size="sm" className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
            <Plus className="h-4 w-4 mr-1" /> Schedule Workshop
          </Button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search workshops..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workshop</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Instructor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">City</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Seats</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Price</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map((w) => (
                  <tr key={w.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clapperboard className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[180px]">{w.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{w.instructor}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" /> {w.date}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {w.city}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={statusStyles[workshopStatuses[w.id]]}>
                        {workshopStatuses[w.id]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {w.seatsBooked}/{w.seatsTotal}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      ₹{w.price.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit Details</DropdownMenuItem>
                          <DropdownMenuItem>View Registrations</DropdownMenuItem>
                          {workshopStatuses[w.id] === "upcoming" && (
                            <DropdownMenuItem onClick={() => handleCancel(w.id)} className="text-destructive">
                              Cancel Workshop
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workshops.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No workshops found.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminWorkshops;
