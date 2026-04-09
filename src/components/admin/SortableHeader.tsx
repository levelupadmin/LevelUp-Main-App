import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortDir = "asc" | "desc" | null;

interface Props {
  label: string;
  field: string;
  current: { field: string; dir: SortDir };
  onSort: (field: string) => void;
  className?: string;
}

export default function SortableHeader({ label, field, current, onSort, className = "" }: Props) {
  const isActive = current.field === field;
  return (
    <th className={`font-medium ${className}`}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {isActive ? (
          current.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function useSort<T>(defaultField: string) {
  const [sort, setSort] = useState<{ field: string; dir: SortDir }>({ field: defaultField, dir: "desc" });

  const toggle = (field: string) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { field, dir: "desc" };
    });
  };

  const comparator = (a: T, b: T): number => {
    const aVal = (a as any)[sort.field];
    const bVal = (b as any)[sort.field];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
    return sort.dir === "asc" ? cmp : -cmp;
  };

  return { sort, toggle, comparator };
}
