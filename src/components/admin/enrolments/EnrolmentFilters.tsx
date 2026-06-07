import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  courseFilter: string;
  setCourseFilter: (v: string) => void;
  offeringFilter: string;
  setOfferingFilter: (v: string) => void;
  setPage: (p: number) => void;
  allCourses: { id: string; title: string }[];
  allOfferings: { id: string; title: string }[];
}

/** Search + status/course/offering filter row for AdminEnrolments. Verbatim
 *  extraction; the parent still owns all state. */
export default function EnrolmentFilters({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  courseFilter,
  setCourseFilter,
  offeringFilter,
  setOfferingFilter,
  setPage,
  allCourses,
  allOfferings,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <Select value={courseFilter} onValueChange={(v) => { setCourseFilter(v); setPage(0); }}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Course" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Courses</SelectItem>
          {allCourses.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={offeringFilter} onValueChange={(v) => { setOfferingFilter(v); setPage(0); }}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Offering" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Offerings</SelectItem>
          {allOfferings.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
