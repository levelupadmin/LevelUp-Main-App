import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, Lock, Unlock, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAdminCourse, useModules, useLessons, useUpdateCourse } from "@/hooks/useCourseAdmin";
import type { Module, Lesson } from "@/hooks/useCourseAdmin";

type DripMode = "none" | "enrollment_date" | "specific_date" | "completion";

interface DripScheduleEntry {
  module_id: string;
  unlock_date?: string; // ISO date string for specific_date mode
  delay_days?: number;  // for enrollment_date mode (override)
}

interface DripTabProps {
  courseId: string;
}

const MODE_INFO: Record<DripMode, { label: string; description: string; icon: React.ReactNode }> = {
  none: {
    label: "No Drip",
    description: "All content is available immediately after enrollment",
    icon: <Unlock className="h-4 w-4" />,
  },
  enrollment_date: {
    label: "Enrollment-Based",
    description: "Unlock sections progressively after enrollment date",
    icon: <Clock className="h-4 w-4" />,
  },
  specific_date: {
    label: "Date-Based",
    description: "Unlock sections on specific calendar dates",
    icon: <CalendarIcon className="h-4 w-4" />,
  },
  completion: {
    label: "By Completion",
    description: "Next lesson unlocks after completing the previous one",
    icon: <Lock className="h-4 w-4" />,
  },
};

const DripTab = ({ courseId }: DripTabProps) => {
  const { data: course, isLoading: courseLoading } = useAdminCourse(courseId);
  const { data: modules = [], isLoading: modulesLoading } = useModules(courseId);
  const { data: lessons = [] } = useLessons(courseId);
  const updateCourse = useUpdateCourse();

  const [dripEnabled, setDripEnabled] = useState(false);
  const [dripMode, setDripMode] = useState<DripMode>("none");
  const [intervalDays, setIntervalDays] = useState(7);
  const [schedule, setSchedule] = useState<DripScheduleEntry[]>([]);
  const [dirty, setDirty] = useState(false);

  // Hydrate state from course data
  useEffect(() => {
    if (!course) return;
    setDripEnabled(course.drip_enabled);
    setDripMode((course.drip_mode as DripMode) || "none");
    setIntervalDays(course.drip_interval_days ?? 7);
    const existing = (course.drip_schedule as unknown as DripScheduleEntry[] | null) ?? [];
    setSchedule(existing);
    setDirty(false);
  }, [course]);

  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => a.sort_order - b.sort_order),
    [modules]
  );

  const lessonsPerModule = useMemo(() => {
    const map: Record<string, Lesson[]> = {};
    for (const l of lessons) {
      if (!map[l.module_id]) map[l.module_id] = [];
      map[l.module_id].push(l);
    }
    return map;
  }, [lessons]);

  const getScheduleForModule = (modId: string) =>
    schedule.find((s) => s.module_id === modId);

  const updateScheduleEntry = (modId: string, updates: Partial<DripScheduleEntry>) => {
    setDirty(true);
    setSchedule((prev) => {
      const idx = prev.findIndex((s) => s.module_id === modId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...updates };
        return copy;
      }
      return [...prev, { module_id: modId, ...updates }];
    });
  };

  const handleToggleEnabled = (enabled: boolean) => {
    setDripEnabled(enabled);
    if (!enabled) setDripMode("none");
    setDirty(true);
  };

  const handleModeChange = (mode: DripMode) => {
    setDripMode(mode);
    setDirty(true);
  };

  const handleSave = () => {
    updateCourse.mutate(
      {
        id: courseId,
        drip_enabled: dripEnabled,
        drip_mode: dripEnabled ? dripMode : "none",
        drip_interval_days: intervalDays,
        drip_schedule: dripEnabled && dripMode === "specific_date" ? schedule as any : null,
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Drip settings saved");
        },
      }
    );
  };

  if (courseLoading || modulesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const computeUnlockDay = (idx: number) => idx * intervalDays;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Drip Settings</h2>
          <p className="text-sm text-muted-foreground">
            Control when content becomes available to students
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || updateCourse.isPending}
        >
          {updateCourse.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : null}
          Save Changes
        </Button>
      </div>

      {/* Enable Toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Enable Content Drip</p>
              <p className="text-xs text-muted-foreground">
                Release content progressively instead of all at once
              </p>
            </div>
          </div>
          <Switch checked={dripEnabled} onCheckedChange={handleToggleEnabled} />
        </div>
      </Card>

      {dripEnabled && (
        <>
          {/* Mode Selector */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Release Mode</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["enrollment_date", "specific_date", "completion"] as DripMode[]).map((mode) => {
                const info = MODE_INFO[mode];
                const isActive = dripMode === mode;
                return (
                  <Card
                    key={mode}
                    className={cn(
                      "p-4 cursor-pointer transition-all border-2",
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-border"
                    )}
                    onClick={() => handleModeChange(mode)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {info.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{info.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Enrollment-Based Config */}
          {dripMode === "enrollment_date" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Each section unlocks after a set number of days from the student's enrollment date.
                  The first section is always available immediately.
                </p>
              </div>

              <div className="max-w-xs">
                <Label className="text-sm">Default Interval (days between sections)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={intervalDays}
                  onChange={(e) => {
                    setIntervalDays(parseInt(e.target.value) || 7);
                    setDirty(true);
                  }}
                  className="mt-1.5"
                />
              </div>

              {sortedModules.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-sm text-muted-foreground">
                    No sections found. Add sections in the Curriculum tab first.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Section Schedule Preview</Label>
                  {sortedModules.map((mod, idx) => {
                    const unlockDay = computeUnlockDay(idx);
                    const lessonCount = lessonsPerModule[mod.id]?.length ?? 0;
                    return (
                      <Card key={mod.id} className="p-3 flex items-center gap-3">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            idx === 0
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {mod.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lessonCount} lesson{lessonCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            idx === 0
                              ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20"
                              : ""
                          )}
                        >
                          {idx === 0 ? "Immediate" : `Day ${unlockDay}`}
                        </Badge>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Specific Date Config */}
          {dripMode === "specific_date" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pick a specific calendar date for each section to unlock.
                  The first section is always available immediately.
                </p>
              </div>

              {sortedModules.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-sm text-muted-foreground">
                    No sections found. Add sections in the Curriculum tab first.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {sortedModules.map((mod, idx) => {
                    const entry = getScheduleForModule(mod.id);
                    const dateVal = entry?.unlock_date ? new Date(entry.unlock_date) : undefined;
                    const lessonCount = lessonsPerModule[mod.id]?.length ?? 0;

                    return (
                      <Card key={mod.id} className="p-3 flex items-center gap-3">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            idx === 0
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {mod.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lessonCount} lesson{lessonCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {idx === 0 ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20"
                          >
                            Immediate
                          </Badge>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "shrink-0 gap-1.5 text-xs",
                                  !dateVal && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="h-3 w-3" />
                                {dateVal ? format(dateVal, "MMM d, yyyy") : "Pick date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                selected={dateVal}
                                onSelect={(d) => {
                                  if (d) {
                                    updateScheduleEntry(mod.id, {
                                      unlock_date: d.toISOString(),
                                    });
                                  }
                                }}
                                disabled={(d) => d < new Date()}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Completion-Based Config */}
          {dripMode === "completion" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Students must complete each lesson before the next one unlocks.
                  The first lesson is always available immediately.
                </p>
              </div>

              {sortedModules.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <p className="text-sm text-muted-foreground">
                    No sections found. Add sections in the Curriculum tab first.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sortedModules.map((mod, modIdx) => {
                    const modLessons = (lessonsPerModule[mod.id] ?? []).sort(
                      (a, b) => a.sort_order - b.sort_order
                    );
                    return (
                      <Card key={mod.id} className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                              modIdx === 0
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {modIdx + 1}
                          </div>
                          <p className="text-sm font-medium text-foreground">{mod.title}</p>
                        </div>
                        {modLessons.length === 0 ? (
                          <p className="text-xs text-muted-foreground pl-8">No lessons</p>
                        ) : (
                          <div className="pl-8 space-y-1">
                            {modLessons.map((lesson, lessonIdx) => {
                              const isFirst = modIdx === 0 && lessonIdx === 0;
                              return (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  {isFirst ? (
                                    <Unlock className="h-3 w-3 text-[hsl(var(--success))]" />
                                  ) : (
                                    <Lock className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span
                                    className={cn(
                                      "truncate",
                                      isFirst ? "text-foreground" : "text-muted-foreground"
                                    )}
                                  >
                                    {lesson.title}
                                  </span>
                                  {isFirst && (
                                    <Badge variant="outline" className="ml-auto text-[10px] bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
                                      Available
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DripTab;
