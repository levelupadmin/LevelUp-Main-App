import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, ChevronUp, ChevronDown, Trash2, GripVertical } from "lucide-react";
import VdoCipherUploader from "@/components/admin/VdoCipherUploader";
import ProtectedVideoUploader from "@/components/admin/ProtectedVideoUploader";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Generic sortable wrapper — hands the drag handle props to its child via a
 *  render prop so sections and chapter rows can place the grip wherever fits. */
function Sortable({ id, children }: {
  id: string;
  children: (args: {
    setNodeRef: (el: HTMLElement | null) => void;
    style: React.CSSProperties;
    handleProps: Record<string, unknown>;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <>
      {children({
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          position: "relative",
          zIndex: isDragging ? 50 : undefined,
        },
        handleProps: { ...attributes, ...listeners, style: { cursor: "grab", touchAction: "none" } },
      })}
    </>
  );
}

interface Chapter {
  id: string;
  title: string;
  content_type: string;
  description: string;
  media_url: string;
  // 'supabase-signed' = download-protected upload in the private bucket.
  // null/'' or an external provider = plain URL (public).
  media_provider: string;
  embed_url: string;
  article_body: string;
  duration_seconds: number;
  make_free: boolean;
  sort_order: number;
  video_type: string;
  vdocipher_video_id: string;
  vdocipher_watermark_text: string;
  thumbnail_url: string;
  vdocipher_thumbnail_url: string;
  _isNew?: boolean;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  chapters: Chapter[];
  _isNew?: boolean;
}

// Monotonic suffix for local "new-…" ids — Date.now() alone can collide when
// two Add clicks land in the same millisecond.
let newIdSeq = 0;

const AdminCourseCurriculum = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [courseTitle, setCourseTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Always-fresh mirror of `sections` for async callbacks (upload persistence
  // fires long after the render that captured its closure).
  const sectionsRef = useRef<Section[]>([]);
  // De-dupes concurrent section inserts: two uploads landing in the same
  // brand-new section must share ONE insert, not create it twice.
  const sectionInsertsRef = useRef<Record<string, Promise<string>>>({});
  const [editingChapter, setEditingChapter] = useState<{ sectionIdx: number; chapterIdx: number } | null>(null);
  const [courseDefaultVideoType, setCourseDefaultVideoType] = useState("standard");
  const [vdoUploadMode, setVdoUploadMode] = useState<Record<string, "upload" | "existing">>({});
  // Per-chapter fetching state for the VdoCipher metadata call - shows a
  // "Fetching from VdoCipher…" hint next to the duration field while
  // we wait on the edge function.
  const [vdoMetaFetching, setVdoMetaFetching] = useState<Record<string, boolean>>({});
  // Tracks which chapters had metadata pulled this session - drives the
  // "Auto-filled from VdoCipher" tag so admins know the duration came
  // from the API and isn't a manual entry.
  const [vdoMetaJustFetched, setVdoMetaJustFetched] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!courseId) return;
    const { data: course } = await supabase.from("courses").select("title, default_video_type").eq("id", courseId).single();
    setCourseTitle(course?.title || "");
    setCourseDefaultVideoType((course as any)?.default_video_type || "standard");

    const { data: secs } = await supabase
      .from("sections")
      .select("id, title, sort_order")
      .eq("course_id", courseId)
      .order("sort_order");

    if (!secs || secs.length === 0) {
      setSections([]);
      setLoading(false);
      return;
    }

    const secIds = secs.map((s) => s.id);
    const { data: chs } = await supabase
      .from("chapters")
      .select("id, title, content_type, description, media_url, media_provider, embed_url, article_body, duration_seconds, make_free, sort_order, section_id, video_type, vdocipher_video_id, vdocipher_watermark_text, thumbnail_url, vdocipher_thumbnail_url")
      .in("section_id", secIds)
      .order("sort_order");

    const chapsBySection: Record<string, Chapter[]> = {};
    (chs || []).forEach((ch) => {
      if (!chapsBySection[ch.section_id]) chapsBySection[ch.section_id] = [];
      chapsBySection[ch.section_id].push({
        id: ch.id,
        title: ch.title,
        content_type: ch.content_type,
        description: ch.description || "",
        media_url: ch.media_url || "",
        media_provider: (ch as { media_provider?: string }).media_provider || "",
        embed_url: ch.embed_url || "",
        article_body: ch.article_body || "",
        duration_seconds: ch.duration_seconds || 0,
        make_free: ch.make_free,
        sort_order: ch.sort_order,
        video_type: (ch as any).video_type || "standard",
        vdocipher_video_id: (ch as any).vdocipher_video_id || "",
        vdocipher_watermark_text: (ch as any).vdocipher_watermark_text || "",
        thumbnail_url: (ch as any).thumbnail_url || "",
        vdocipher_thumbnail_url: (ch as any).vdocipher_thumbnail_url || "",
      });
    });

    setSections(secs.map((s) => ({ ...s, chapters: chapsBySection[s.id] || [] })));
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);
  // Keep the async-callback mirror in sync every render.
  sectionsRef.current = sections;

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${newIdSeq++}`,
        title: "New Section",
        sort_order: prev.length,
        chapters: [],
        _isNew: true,
      },
    ]);
  };

  const addChapter = (sectionIdx: number) => {
    setSections((prev) => {
      const updated = [...prev];
      updated[sectionIdx] = {
        ...updated[sectionIdx],
        chapters: [
          ...updated[sectionIdx].chapters,
          {
            id: `new-${Date.now()}-${newIdSeq++}`,
            title: "New Chapter",
            content_type: "video",
            description: "",
            media_url: "",
            media_provider: "",
            embed_url: "",
            article_body: "",
            duration_seconds: 0,
            make_free: false,
            sort_order: updated[sectionIdx].chapters.length,
            video_type: courseDefaultVideoType,
            vdocipher_video_id: "",
            vdocipher_watermark_text: "",
            thumbnail_url: "",
            vdocipher_thumbnail_url: "",
            _isNew: true,
          },
        ],
      };
      return updated;
    });
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  // Sections and chapters share one DndContext; ids are namespaced
  // ("sec:<id>" / "ch:<id>") so the handlers can tell them apart.
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const findSectionIdxByChapter = (prefixedChId: string, list: Section[]) =>
    list.findIndex((s) => s.chapters.some((c) => `ch:${c.id}` === prefixedChId));

  // Live cross-section move while dragging a chapter over another section.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    if (!a.startsWith("ch:")) return;
    setSections((prev) => {
      const fromIdx = findSectionIdxByChapter(a, prev);
      const toIdx = o.startsWith("ch:")
        ? findSectionIdxByChapter(o, prev)
        : o.startsWith("sec:")
        ? prev.findIndex((s) => `sec:${s.id}` === o)
        : -1;
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const moving = prev[fromIdx].chapters.find((c) => `ch:${c.id}` === a)!;
      const insertAt = o.startsWith("ch:")
        ? prev[toIdx].chapters.findIndex((c) => `ch:${c.id}` === o)
        : prev[toIdx].chapters.length;
      const next = [...prev];
      next[fromIdx] = { ...next[fromIdx], chapters: next[fromIdx].chapters.filter((c) => `ch:${c.id}` !== a) };
      const target = [...next[toIdx].chapters];
      target.splice(insertAt < 0 ? target.length : insertAt, 0, moving);
      next[toIdx] = { ...next[toIdx], chapters: target };
      return next;
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    let next: Section[] | null = null;
    if (a.startsWith("sec:") && o.startsWith("sec:") && a !== o) {
      setSections((prev) => {
        const from = prev.findIndex((s) => `sec:${s.id}` === a);
        const to = prev.findIndex((s) => `sec:${s.id}` === o);
        if (from === -1 || to === -1) return prev;
        next = arrayMove(prev, from, to).map((s, i) => ({ ...s, sort_order: i }));
        return next;
      });
    } else if (a.startsWith("ch:")) {
      setSections((prev) => {
        const sIdx = findSectionIdxByChapter(a, prev);
        if (sIdx === -1) return prev;
        const chapters = prev[sIdx].chapters;
        const from = chapters.findIndex((c) => `ch:${c.id}` === a);
        const to = o.startsWith("ch:") ? chapters.findIndex((c) => `ch:${c.id}` === o) : from;
        const arr = [...prev];
        arr[sIdx] = {
          ...arr[sIdx],
          chapters: (from !== -1 && to !== -1 && from !== to ? arrayMove(chapters, from, to) : chapters)
            .map((c, i) => ({ ...c, sort_order: i })),
        };
        next = arr;
        return arr;
      });
    }
    // Persist the new order right away for rows that already exist in the DB —
    // arranging the flow shouldn't be lost to a forgotten Save. Unsaved
    // ("new-…") rows keep their position on the next manual Save.
    if (next) void persistOrder(next);
  };

  // Fire-and-forget order writer: sort_order for sections, sort_order +
  // section_id for chapters (covers cross-section moves). Saved rows only.
  const persistOrder = async (list: Section[]) => {
    try {
      const jobs: PromiseLike<unknown>[] = [];
      list.forEach((sec, sIdx) => {
        if (!sec._isNew) {
          jobs.push(supabase.from("sections").update({ sort_order: sIdx }).eq("id", sec.id));
          sec.chapters.forEach((ch, cIdx) => {
            if (!ch._isNew) {
              jobs.push(
                supabase.from("chapters").update({ sort_order: cIdx, section_id: sec.id }).eq("id", ch.id)
              );
            }
          });
        }
      });
      await Promise.all(jobs);
    } catch {
      toast({
        title: "Couldn't save the new order",
        description: "Click Save Curriculum to persist it.",
        variant: "destructive",
      });
    }
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const arr = [...prev];
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((s, i) => ({ ...s, sort_order: i }));
    });
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, title } : s)));
  };

  const updateChapter = (sIdx: number, cIdx: number, updates: Partial<Chapter>) => {
    setSections((prev) => {
      const updated = [...prev];
      const chapters = [...updated[sIdx].chapters];
      chapters[cIdx] = { ...chapters[cIdx], ...updates };
      updated[sIdx] = { ...updated[sIdx], chapters };
      return updated;
    });
  };

  // Pull duration + poster from VdoCipher for a given chapter. We don't
  // overwrite a duration the admin manually set (force=false), but we
  // always refresh the thumbnail since the admin has no way to set it
  // independently. Caller passes the section + chapter index because
  // chapter ids change between local "new-..." placeholders and saved
  // UUIDs - using indices avoids stale closures.
  const fetchVdoMeta = useCallback(async (
    sIdx: number,
    cIdx: number,
    videoId: string,
    opts: { overrideDuration?: boolean } = {}
  ) => {
    if (!videoId?.trim()) return;
    const key = `${sIdx}-${cIdx}`;
    setVdoMetaFetching((prev) => ({ ...prev, [key]: true }));
    try {
      const { data, error } = await supabase.functions.invoke<{
        duration_seconds: number | null;
        thumbnail_url: string | null;
      }>("get-vdocipher-video-meta", { body: { video_id: videoId.trim() } });
      if (error) throw error;
      if (!data) throw new Error("Empty response");

      setSections((prev) => {
        const updated = [...prev];
        const chapters = [...updated[sIdx].chapters];
        const current = chapters[cIdx];
        if (!current) return prev;
        const next: Chapter = { ...current };
        // Only overwrite duration if it's currently zero/unset, unless
        // the caller forces it (e.g. fresh upload).
        if (
          typeof data.duration_seconds === "number" &&
          (opts.overrideDuration || !current.duration_seconds)
        ) {
          next.duration_seconds = data.duration_seconds;
        }
        if (data.thumbnail_url) {
          next.vdocipher_thumbnail_url = data.thumbnail_url;
        }
        chapters[cIdx] = next;
        updated[sIdx] = { ...updated[sIdx], chapters };
        return updated;
      });
      setVdoMetaJustFetched((prev) => ({ ...prev, [key]: true }));
    } catch (err: any) {
      // Quiet failure - admin can still type duration manually, and
      // a missing thumbnail just falls back to the numbered tile.
      console.warn("fetchVdoMeta failed", err?.message ?? err);
      toast({
        title: "Couldn't fetch VdoCipher metadata",
        description: err?.message ?? "Video may not exist or be ready yet.",
        variant: "destructive",
      });
    } finally {
      setVdoMetaFetching((prev) => ({ ...prev, [key]: false }));
    }
  }, [toast]);

  // Backfill metadata for chapters that already have a vdocipher_video_id
  // but no cached thumbnail. Runs once after the curriculum loads so
  // existing chapters self-heal the next time an admin opens the page.
  useEffect(() => {
    if (loading || sections.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        for (let cIdx = 0; cIdx < sections[sIdx].chapters.length; cIdx++) {
          if (cancelled) return;
          const ch = sections[sIdx].chapters[cIdx];
          if (
            ch.video_type === "vdocipher" &&
            ch.vdocipher_video_id?.trim() &&
            !ch.vdocipher_thumbnail_url &&
            !ch._isNew
          ) {
            // Sequential to avoid hammering VdoCipher with 30+ parallel
            // requests on a course with many lessons.
            await fetchVdoMeta(sIdx, cIdx, ch.vdocipher_video_id);
          }
        }
      }
    })();
    return () => { cancelled = true; };
    // Intentionally only depends on `loading` - we want this to run
    // exactly once when the load finishes, not on every section edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const removeChapter = (sIdx: number, cIdx: number) => {
    setSections((prev) => {
      const updated = [...prev];
      updated[sIdx] = {
        ...updated[sIdx],
        chapters: updated[sIdx].chapters.filter((_, i) => i !== cIdx),
      };
      return updated;
    });
  };

  const handleSave = async () => {
    if (!courseId) return;

    // Validate chapter video fields before saving. NOTE: a standard-video
    // chapter with no media yet is fine — it's a placeholder the admin will
    // upload into later. Blocking the ENTIRE save on it once cost us two
    // uploaded recordings; never make an unrelated chapter veto a save.
    for (const sec of sections) {
      for (const ch of sec.chapters) {
        if (ch.content_type === "video" && ch.video_type === "vdocipher" && !ch.vdocipher_video_id?.trim()) {
          toast({
            title: "Validation Error",
            description: `Chapter "${ch.title}" in "${sec.title}" uses VdoCipher but has no Video ID.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSaving(true);

    try {
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx];
        let sectionId = sec.id;

        if (sec._isNew) {
          const { data, error } = await supabase
            .from("sections")
            .insert({ course_id: courseId, title: sec.title, sort_order: sIdx })
            .select("id")
            .single();
          if (error) throw error;
          sectionId = data.id;
        } else {
          const { error } = await supabase
            .from("sections")
            .update({ title: sec.title, sort_order: sIdx })
            .eq("id", sectionId);
          if (error) throw error;
        }

        for (let cIdx = 0; cIdx < sec.chapters.length; cIdx++) {
          const ch = sec.chapters[cIdx];
          const payload: Record<string, unknown> = {
            section_id: sectionId,
            title: ch.title,
            content_type: ch.content_type,
            description: ch.description || null,
            media_url: ch.media_url || null,
            media_provider: ch.media_provider || null,
            embed_url: ch.embed_url || null,
            article_body: ch.article_body || null,
            duration_seconds: ch.duration_seconds || 0,
            make_free: ch.make_free,
            sort_order: cIdx,
            video_type: ch.video_type || "standard",
            vdocipher_video_id: ch.vdocipher_video_id || null,
            vdocipher_watermark_text: ch.vdocipher_watermark_text || null,
            thumbnail_url: ch.thumbnail_url || null,
            vdocipher_thumbnail_url: ch.vdocipher_thumbnail_url || null,
          };

          if (ch._isNew) {
            const { error } = await supabase.from("chapters").insert(payload as any);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("chapters").update(payload as any).eq("id", ch.id);
            if (error) throw error;
          }
        }
      }

      toast({ title: "Curriculum saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Targeted persistence for uploads. When a video upload attaches a key, we
  // save ONLY that chapter's row (inserting it — and its section — if brand
  // new), then swap the real UUIDs into local state IN PLACE.
  //
  // Deliberately NOT handleSave(): a full save (a) validates every chapter, so
  // an unrelated half-filled chapter would silently abort persisting the
  // upload, (b) re-inserts every _isNew row (double-insert races between
  // parallel uploads), and (c) reload()s state from the DB, wiping in-progress
  // edits mid-typing — the combination that caused the 2026-08-03 lost-
  // recordings incident. Title/description edits still use the manual Save.
  // ───────────────────────────────────────────────────────────────────────────

  // Insert a brand-new section exactly once even if two uploads race into it.
  const ensureSectionSaved = useCallback(async (localId: string): Promise<string> => {
    const secs = sectionsRef.current;
    const sIdx = secs.findIndex((s) => s.id === localId);
    const sec = secs[sIdx];
    if (!sec) throw new Error("Section no longer exists");
    if (!sec._isNew) return sec.id;
    const inflight = sectionInsertsRef.current[localId];
    if (inflight) return inflight;
    const p = (async () => {
      const { data, error } = await supabase
        .from("sections")
        .insert({ course_id: courseId, title: sec.title, sort_order: sIdx })
        .select("id")
        .single();
      if (error) throw error;
      setSections((prev) => prev.map((s) => (s.id === localId ? { ...s, id: data.id, _isNew: false } : s)));
      return data.id as string;
    })();
    sectionInsertsRef.current[localId] = p;
    p.catch(() => { delete sectionInsertsRef.current[localId]; });
    return p;
  }, [courseId]);

  // Persist the uploaded chapter; returns its REAL id (for the background
  // completion patch) or undefined on failure. Looks the chapter up by its
  // local id — indices captured in closures go stale across renders.
  const persistUploadedChapter = useCallback(async (chapterLocalId: string, key: string): Promise<string | undefined> => {
    const media = { media_url: key, media_provider: "supabase-signed", video_type: "standard" } as const;
    // Reflect the upload in local state immediately (by id, never by index).
    setSections((prev) => prev.map((s) => ({
      ...s,
      chapters: s.chapters.map((c) => (c.id === chapterLocalId ? { ...c, ...media } : c)),
    })));
    try {
      const secs = sectionsRef.current;
      const sec = secs.find((s) => s.chapters.some((c) => c.id === chapterLocalId));
      if (!sec || !courseId) throw new Error("Chapter no longer exists on this page");
      const ch = sec.chapters.find((c) => c.id === chapterLocalId)!;
      const sectionId = await ensureSectionSaved(sec.id);

      if (ch._isNew) {
        const cIdx = sec.chapters.findIndex((c) => c.id === chapterLocalId);
        const { data, error } = await supabase
          .from("chapters")
          .insert({
            section_id: sectionId,
            title: ch.title,
            content_type: ch.content_type || "video",
            description: ch.description || null,
            ...media,
            embed_url: ch.embed_url || null,
            article_body: ch.article_body || null,
            duration_seconds: ch.duration_seconds || 0,
            make_free: ch.make_free,
            sort_order: cIdx,
            thumbnail_url: ch.thumbnail_url || null,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        setSections((prev) => prev.map((s) => ({
          ...s,
          chapters: s.chapters.map((c) => (c.id === chapterLocalId ? { ...c, id: data.id, _isNew: false } : c)),
        })));
        toast({ title: "Video attached & saved", description: ch.title });
        return data.id as string;
      }

      const { error } = await supabase.from("chapters").update(media as any).eq("id", ch.id);
      if (error) throw error;
      toast({ title: "Video attached & saved", description: ch.title });
      return ch.id;
    } catch (err: any) {
      toast({
        title: "Couldn't auto-save the chapter",
        description: `${err.message}. The file itself is safe in storage — click Save Curriculum to attach it.`,
        variant: "destructive",
      });
      return undefined;
    }
  }, [courseId, ensureSectionSaved, toast]);

  const ec = editingChapter;

  return (
    <>
      <button
        onClick={() => navigate(`/admin/courses/${courseId}/edit`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-[hsl(var(--accent-amber))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <DndContext sensors={dndSensors} collisionDetection={closestCorners} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => `sec:${s.id}`)} strategy={verticalListSortingStrategy}>
          {sections.map((sec, sIdx) => (
            <Sortable key={sec.id} id={`sec:${sec.id}`}>
            {({ setNodeRef, style, handleProps }) => (
            <div ref={setNodeRef} style={style} className="bg-card border border-border rounded-xl">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <span {...handleProps} title="Drag to reorder section">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                </span>
                <Input
                  value={sec.title}
                  onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                  className="font-medium border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                />
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <button onClick={() => moveSection(sIdx, -1)} className="p-1 hover:bg-secondary rounded" disabled={sIdx === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => moveSection(sIdx, 1)} className="p-1 hover:bg-secondary rounded" disabled={sIdx === sections.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeSection(sIdx)} className="p-1 hover:bg-destructive/20 text-destructive rounded">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Chapters */}
              <div className="p-3 space-y-2">
                <SortableContext items={sec.chapters.map((c) => `ch:${c.id}`)} strategy={verticalListSortingStrategy}>
                {sec.chapters.map((ch, cIdx) => (
                  <Sortable key={ch.id} id={`ch:${ch.id}`}>
                  {({ setNodeRef: setChRef, style: chStyle, handleProps: chHandle }) => (
                  <div ref={setChRef} style={chStyle}>
                    <div
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer"
                      onClick={() => setEditingChapter(ec?.sectionIdx === sIdx && ec?.chapterIdx === cIdx ? null : { sectionIdx: sIdx, chapterIdx: cIdx })}
                    >
                      <span {...chHandle} title="Drag to reorder — drop on another section to move it there" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </span>
                      <span className="text-xs font-mono text-muted-foreground w-6">{cIdx + 1}</span>
                      <span className="text-sm flex-1">{ch.title}</span>
                      <span className="text-xs font-mono text-muted-foreground">{ch.content_type}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeChapter(sIdx, cIdx); }} className="p-1 text-destructive hover:bg-destructive/20 rounded">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Inline editor */}
                    {ec?.sectionIdx === sIdx && ec?.chapterIdx === cIdx && (
                      <div className="mt-2 ml-9 space-y-3 p-4 border border-border rounded-lg bg-background">
                        <div>
                          <label className="block text-xs font-medium mb-1">Title</label>
                          <Input value={ch.title} onChange={(e) => updateChapter(sIdx, cIdx, { title: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Content Type</label>
                          <Select value={ch.content_type} onValueChange={(v) => updateChapter(sIdx, cIdx, { content_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="video">Video</SelectItem>
                              <SelectItem value="text">Text / Article</SelectItem>
                              <SelectItem value="pdf">PDF</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="embedded">Embedded Link</SelectItem>
                              <SelectItem value="quiz">Quiz</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Description</label>
                          <Textarea value={ch.description} onChange={(e) => updateChapter(sIdx, cIdx, { description: e.target.value })} rows={2} />
                        </div>
                        {/* Video type selector (only for video content) */}
                        {ch.content_type === "video" && (
                          <div>
                            <label className="block text-xs font-medium mb-1">Video Type</label>
                            <Select value={ch.video_type} onValueChange={(v) => updateChapter(sIdx, cIdx, { video_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">Standard upload</SelectItem>
                                <SelectItem value="vdocipher">VdoCipher DRM video</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Standard video: upload a download-protected file (default,
                            recommended) OR paste an external URL (public). */}
                        {ch.content_type === "video" && ch.video_type === "standard" && (
                          <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/20">
                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Upload a video (download-protected — recommended)
                              </label>
                              <ProtectedVideoUploader
                                courseId={courseId || undefined}
                                chapterId={ch.id}
                                label={`${ch.title || "Untitled chapter"}${courseTitle ? " · " + courseTitle : ""}`}
                                alreadyProtected={ch.media_provider === "supabase-signed"}
                                onUploaded={(key) =>
                                  // Targeted save of just this chapter (inserts
                                  // it if new); returns the real id so the
                                  // background completion patch can find it.
                                  persistUploadedChapter(ch.id, key)
                                }
                              />
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Goes to a private bucket — no public link, download disabled. The upload runs in the background and saves automatically.
                              </p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">
                                …or paste an external URL (Vimeo / YouTube / embed — public)
                              </label>
                              <Input
                                value={ch.media_provider === "supabase-signed" ? "" : ch.media_url}
                                disabled={ch.media_provider === "supabase-signed"}
                                onChange={(e) =>
                                  updateChapter(sIdx, cIdx, {
                                    media_url: e.target.value,
                                    media_provider: "",
                                  })
                                }
                                placeholder={
                                  ch.media_provider === "supabase-signed"
                                    ? "Using a protected upload — clear it to paste a URL"
                                    : "https://vimeo.com/123456789"
                                }
                              />
                              {ch.media_provider === "supabase-signed" && (
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground underline mt-1"
                                  onClick={() =>
                                    updateChapter(sIdx, cIdx, { media_url: "", media_provider: "" })
                                  }
                                >
                                  Remove protected video and paste a URL instead
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* VdoCipher video fields */}
                        {ch.content_type === "video" && ch.video_type === "vdocipher" && (
                          <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/20">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                className={`text-xs px-2 py-1 rounded ${(vdoUploadMode[ch.id] || "existing") === "upload" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                                onClick={() => setVdoUploadMode((m) => ({ ...m, [ch.id]: "upload" }))}
                              >
                                Upload new video
                              </button>
                              <button
                                type="button"
                                className={`text-xs px-2 py-1 rounded ${(vdoUploadMode[ch.id] || "existing") === "existing" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                                onClick={() => setVdoUploadMode((m) => ({ ...m, [ch.id]: "existing" }))}
                              >
                                Use existing Video ID
                              </button>
                            </div>

                            {(vdoUploadMode[ch.id] || "existing") === "upload" ? (
                              <VdoCipherUploader
                                onUploadComplete={(videoId) => {
                                  updateChapter(sIdx, cIdx, { vdocipher_video_id: videoId });
                                  // Fresh upload - override any stale duration the
                                  // chapter row had from a previous video.
                                  fetchVdoMeta(sIdx, cIdx, videoId, { overrideDuration: true });
                                }}
                              />
                            ) : (
                              <div>
                                <label className="block text-xs font-medium mb-1">VdoCipher Video ID</label>
                                <Input
                                  value={ch.vdocipher_video_id}
                                  onChange={(e) => updateChapter(sIdx, cIdx, { vdocipher_video_id: e.target.value })}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (v && v !== ch.vdocipher_video_id?.trim()) return;
                                    if (v) fetchVdoMeta(sIdx, cIdx, v);
                                  }}
                                  placeholder="e.g. 1234567890abcdef"
                                />
                              </div>
                            )}

                            {ch.vdocipher_video_id && (
                              <p className="text-xs text-muted-foreground">Video ID: {ch.vdocipher_video_id}</p>
                            )}

                            <div>
                              <label className="block text-xs font-medium mb-1">Watermark text</label>
                              <Input
                                value={ch.vdocipher_watermark_text}
                                onChange={(e) => updateChapter(sIdx, cIdx, { vdocipher_watermark_text: e.target.value })}
                                placeholder="(defaults to student email)"
                              />
                            </div>
                          </div>
                        )}

                        {/* PDF / Image URL */}
                        {(ch.content_type === "pdf" || ch.content_type === "image") && (
                          <div>
                            <label className="block text-xs font-medium mb-1">
                              {ch.content_type === "pdf" ? "PDF URL" : "Image URL"}
                            </label>
                            <Input
                              value={ch.media_url}
                              onChange={(e) => updateChapter(sIdx, cIdx, { media_url: e.target.value })}
                              placeholder={ch.content_type === "pdf" ? "https://example.com/document.pdf" : "https://example.com/image.jpg"}
                            />
                          </div>
                        )}
                        {ch.content_type === "embedded" && (
                          <div>
                            <label className="block text-xs font-medium mb-1">Embed URL</label>
                            <Input
                              value={ch.embed_url}
                              onChange={(e) => updateChapter(sIdx, cIdx, { embed_url: e.target.value })}
                              placeholder="https://example.com/embed/..."
                            />
                          </div>
                        )}
                        {ch.content_type === "text" && (
                          <div>
                            <label className="block text-xs font-medium mb-1">Article Body</label>
                            <Textarea value={ch.article_body} onChange={(e) => updateChapter(sIdx, cIdx, { article_body: e.target.value })} rows={6} />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Custom Thumbnail URL
                            <span className="text-muted-foreground/60 font-normal ml-1">- optional override. Falls back to the VdoCipher poster.</span>
                          </label>
                          <Input
                            value={ch.thumbnail_url}
                            onChange={(e) => updateChapter(sIdx, cIdx, { thumbnail_url: e.target.value })}
                            placeholder="https://..."
                          />
                          {/* Show what'll actually render in the Up Next rail.
                              Mirrors the runtime fallback chain so admins see
                              what students will see. */}
                          <div className="mt-2 flex items-center gap-3">
                            {ch.thumbnail_url ? (
                              <>
                                <img
                                  src={ch.thumbnail_url}
                                  alt=""
                                  className="w-32 aspect-video object-cover rounded-md border border-border"
                                />
                                <span className="text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--cream))]/80">
                                  Using custom thumbnail
                                </span>
                              </>
                            ) : ch.vdocipher_thumbnail_url ? (
                              <>
                                <img
                                  src={ch.vdocipher_thumbnail_url}
                                  alt=""
                                  className="w-32 aspect-video object-cover rounded-md border border-border"
                                />
                                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                  Using VdoCipher poster
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                                No thumbnail yet. Set a VdoCipher video ID or paste a custom URL.
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1 flex items-center gap-2">
                              Duration (seconds)
                              {vdoMetaFetching[`${sIdx}-${cIdx}`] && (
                                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                  Fetching from VdoCipher…
                                </span>
                              )}
                              {!vdoMetaFetching[`${sIdx}-${cIdx}`] && vdoMetaJustFetched[`${sIdx}-${cIdx}`] && (
                                <span className="text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--accent-emerald))]/80">
                                  Auto-filled from VdoCipher
                                </span>
                              )}
                            </label>
                            <Input type="number" value={ch.duration_seconds} onChange={(e) => updateChapter(sIdx, cIdx, { duration_seconds: Number(e.target.value) })} />
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            <Switch checked={ch.make_free} onCheckedChange={(v) => updateChapter(sIdx, cIdx, { make_free: v })} />
                            <label className="text-xs">Make Free</label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                  </Sortable>
                ))}
                </SortableContext>
                <button
                  onClick={() => addChapter(sIdx)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 py-2"
                >
                  <Plus className="h-3 w-3" /> Add Chapter
                </button>
              </div>
            </div>
            )}
            </Sortable>
          ))}
          </SortableContext>
          </DndContext>

          <button
            onClick={addSection}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl px-4 py-3 w-full justify-center"
          >
            <Plus className="h-4 w-4" /> Add Section
          </button>

          <div className="pt-4">
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Saving…" : "Save Curriculum"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminCourseCurriculum;
