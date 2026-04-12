import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

interface MultiSelectProps {
  groups: OptionGroup[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ groups, selected, onChange, placeholder = "All", className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  const allOptions = groups.flatMap((g) => g.options);
  const selectedLabels = selected
    .map((v) => allOptions.find((o) => o.value === v)?.label)
    .filter(Boolean);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const toggleGroup = (group: OptionGroup) => {
    const groupValues = group.options.map((o) => o.value);
    const allSelected = groupValues.every((v) => selected.includes(v));
    if (allSelected) {
      onChange(selected.filter((v) => !groupValues.includes(v)));
    } else {
      const newSelected = new Set([...selected, ...groupValues]);
      onChange([...newSelected]);
    }
  };

  // Filter groups and options based on search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((group) => {
        // If group label matches, show all options
        if (group.label.toLowerCase().includes(q)) return group;
        // Otherwise filter individual options
        const filtered = group.options.filter((o) => o.label.toLowerCase().includes(q));
        return filtered.length > 0 ? { ...group, options: filtered } : null;
      })
      .filter(Boolean) as OptionGroup[];
  }, [groups, search]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-3 border border-input rounded-md bg-transparent text-xs hover:bg-accent hover:text-accent-foreground transition-colors w-full min-w-[160px]"
      >
        <span className="truncate flex-1 text-left">
          {selected.length === 0
            ? placeholder
            : selected.length <= 2
              ? selectedLabels.join(", ")
              : `${selected.length} selected`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange([]); }}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 left-0 min-w-full w-max max-w-[300px] bg-popover border border-border rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
          {/* Search input */}
          <div className="px-2 pt-2 pb-1 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-6 pr-2 py-1.5 text-xs bg-transparent border border-border/50 rounded focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto py-1 flex-1">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground text-center">No matches</p>
            ) : (
              filteredGroups.map((group) => {
                // Use original group for toggle logic (select all in full group)
                const originalGroup = groups.find((g) => g.label === group.label) || group;
                const groupValues = originalGroup.options.map((o) => o.value);
                const allGroupSelected = groupValues.every((v) => selected.includes(v));
                const someGroupSelected = groupValues.some((v) => selected.includes(v));

                return (
                  <div key={group.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(originalGroup)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:bg-accent/50 transition-colors"
                    >
                      <div className={cn(
                        "h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0",
                        allGroupSelected ? "bg-primary border-primary" : someGroupSelected ? "border-primary" : "border-muted-foreground/30",
                      )}>
                        {allGroupSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        {someGroupSelected && !allGroupSelected && <div className="h-1.5 w-1.5 bg-primary rounded-sm" />}
                      </div>
                      {group.label}
                    </button>

                    {group.options.map((option) => {
                      const isSelected = selected.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggle(option.value)}
                          className="flex items-center gap-2 w-full px-3 pl-6 py-1.5 text-xs hover:bg-accent/50 transition-colors"
                        >
                          <div className={cn(
                            "h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0",
                            isSelected ? "bg-primary border-primary" : "border-muted-foreground/30",
                          )}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
