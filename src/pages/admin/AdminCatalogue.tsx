import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACCESS, FORMAT, LISTING, OFFERING_STATUS, ROW_FORMATS, ROW_TITLE, isReady, pageReadiness, renumber,
} from "@/lib/catalogue";
import { PageDialog } from "@/components/admin/catalogue/PageDialog";
import type { CatCourse, CatOffering, CatPage } from "@/components/admin/catalogue/types";

/*
 * Admin → Catalogue (founder, 6 Nov 2026). One screen for the three parts of
 * every product, side by side:
 *
 *   Page (what people see) → Offering (what they pay for) → Content (what they watch)
 *
 * Click anything to light up what it's connected to. "Explore & Home" sets
 * what shows and in what order. Students are counted in the database
 * (admin_catalogue_counts), never added up in the browser.
 */

type Sel = { kind: "page" | "offering" | "course"; id: string } | null;
interface Counts { students: number; tagmango: number }

async function loadAll() {
  const chapters: { section_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("chapters").select("section_id").range(from, from + 999);
    if (error) throw error;
    chapters.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [p, o, c, oc, s, b, n] = await Promise.all([
    supabase.from("pages").select("id, slug, title, listing, position, carousel_position, opens, button_offering_id, carousel_title, card_image_url"),
    supabase.from("offerings").select("id, slug, title, status, access, price_inr, product_tier, page_id, thumbnail_url, tally_form_url, payment_mode, v:landing->v"),
    supabase.from("courses").select("id, title, status"),
    supabase.from("offering_courses").select("offering_id, course_id"),
    supabase.from("sections").select("id, course_id").range(0, 4999),
    supabase.from("offering_bumps").select("parent_offering_id, bump_offering_id"),
    supabase.rpc("admin_catalogue_counts"),
  ]);
  const err = p.error || o.error || c.error || oc.error || s.error || b.error;
  if (err) throw err;
  const courseOfSection = new Map((s.data ?? []).map((x) => [x.id, x.course_id]));
  const lessons = new Map<string, number>();
  for (const ch of chapters) {
    const cid = courseOfSection.get(ch.section_id);
    if (cid) lessons.set(cid, (lessons.get(cid) ?? 0) + 1);
  }
  const counts = new Map<string, Counts>();
  for (const r of (n.data ?? []) as { offering_id: string; students: number; tagmango: number }[]) {
    counts.set(r.offering_id, { students: Number(r.students), tagmango: Number(r.tagmango) });
  }
  return {
    pages: (p.data ?? []) as CatPage[],
    offerings: ((o.data ?? []) as unknown as (Omit<CatOffering, "has_landing"> & { v: unknown })[])
      .map(({ v, ...rest }) => ({ ...rest, has_landing: v != null })),
    courses: ((c.data ?? []) as { id: string; title: string; status: string | null }[])
      .map((x) => ({ ...x, lessons: lessons.get(x.id) ?? 0 })) as CatCourse[],
    links: (oc.data ?? []) as { offering_id: string; course_id: string }[],
    bumps: (b.data ?? []) as { parent_offering_id: string; bump_offering_id: string }[],
    counts,
  };
}
type Data = Awaited<ReturnType<typeof loadAll>>;

const inr = (v: number | string | null) => (Number(v) > 0 ? `₹${Number(v).toLocaleString("en-IN")}` : "₹0");

function Chip({ children, tone = "plain", title }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" | "muted"; title?: string }) {
  return (
    <span title={title} className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
      tone === "good" && "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]",
      tone === "warn" && "bg-[hsl(var(--accent-amber,38_92%_50%)/0.18)] text-[hsl(var(--accent-amber,38_92%_40%))]",
      tone === "muted" && "bg-secondary text-muted-foreground",
      tone === "plain" && "bg-secondary text-foreground",
    )}>{children}</span>
  );
}

function Item({ active, dim, onClick, children }: { active: boolean; dim: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border px-3 py-2 transition-colors",
        active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/30",
        dim && "opacity-35",
      )}>
      {children}
    </button>
  );
}

export default function AdminCatalogue() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<CatPage | null | "new">(null);
  const [moving, setMoving] = useState(false);

  const reload = useCallback(async () => {
    try { setData(await loadAll()); setFailed(null); } catch (e) { setFailed((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const derived = useMemo(() => {
    if (!data) return null;
    const off = new Map(data.offerings.map((o) => [o.id, o]));
    const coursesOf = new Map<string, string[]>();
    const offeringsOf = new Map<string, string[]>();
    for (const l of data.links) {
      coursesOf.set(l.offering_id, [...(coursesOf.get(l.offering_id) ?? []), l.course_id]);
      offeringsOf.set(l.course_id, [...(offeringsOf.get(l.course_id) ?? []), l.offering_id]);
    }
    const lessonsOfCourse = new Map(data.courses.map((c) => [c.id, c.lessons]));
    const lessonsByOffering = new Map(data.offerings.map((o) => [o.id, (coursesOf.get(o.id) ?? []).reduce((n, c) => n + (lessonsOfCourse.get(c) ?? 0), 0)]));
    const pagesOfOffering = (oid: string) => data.pages.filter((p) => p.button_offering_id === oid || off.get(oid)?.page_id === p.id);
    const offeringsOfPage = (pid: string) => {
      const p = data.pages.find((x) => x.id === pid);
      return data.offerings.filter((o) => o.page_id === pid || o.id === p?.button_offering_id).map((o) => o.id);
    };
    const addonsOf = new Map<string, number>();
    for (const b of data.bumps) addonsOf.set(b.parent_offering_id, (addonsOf.get(b.parent_offering_id) ?? 0) + 1);
    return { off, coursesOf, offeringsOf, lessonsByOffering, pagesOfOffering, offeringsOfPage, addonsOf };
  }, [data]);

  // What the current selection is connected to.
  const lit = useMemo(() => {
    if (!data || !derived || !sel) return null;
    const pages = new Set<string>(), offerings = new Set<string>(), courses = new Set<string>();
    const fromOffering = (oid: string) => { offerings.add(oid); (derived.coursesOf.get(oid) ?? []).forEach((c) => courses.add(c)); };
    if (sel.kind === "page") {
      pages.add(sel.id);
      derived.offeringsOfPage(sel.id).forEach(fromOffering);
    } else if (sel.kind === "offering") {
      fromOffering(sel.id);
      derived.pagesOfOffering(sel.id).forEach((p) => pages.add(p.id));
    } else {
      courses.add(sel.id);
      (derived.offeringsOf.get(sel.id) ?? []).forEach((oid) => {
        offerings.add(oid);
        derived.pagesOfOffering(oid).forEach((p) => pages.add(p.id));
      });
    }
    return { pages, offerings, courses };
  }, [data, derived, sel]);

  if (failed) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="font-medium">The catalogue couldn't load.</p>
        <p className="text-sm text-muted-foreground mt-1">{failed}</p>
        <Button className="mt-4" variant="outline" onClick={() => void reload()}>Try again</Button>
      </div>
    );
  }
  if (!data || !derived) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const q = search.trim().toLowerCase();
  const match = (t: string) => !q || t.toLowerCase().includes(q);
  // With something selected, what it's connected to comes first in each column.
  const litFirst = (set: Set<string> | undefined) => (a: { id: string }, b: { id: string }) =>
    set ? Number(set.has(b.id)) - Number(set.has(a.id)) : 0;
  const shownOfferings = data.offerings
    .filter((o) => status === "all" || o.status === status || (lit?.offerings.has(o.id) ?? false))
    .filter((o) => match(o.title) || (lit?.offerings.has(o.id) ?? false))
    .sort((a, b) => litFirst(lit?.offerings)(a, b) || a.title.localeCompare(b.title));
  const shownOfferingIds = new Set(shownOfferings.map((o) => o.id));
  const shownPages = data.pages
    .filter((p) => match(p.title) || (lit?.pages.has(p.id) ?? false))
    .sort((a, b) => litFirst(lit?.pages)(a, b) || LISTING_RANK[b.listing] - LISTING_RANK[a.listing] || a.position - b.position);
  const shownCourses = data.courses
    .filter((c) => (lit?.courses.has(c.id) ?? false) || (match(c.title) && (q || (derived.offeringsOf.get(c.id) ?? []).some((oid) => shownOfferingIds.has(oid)))))
    .sort((a, b) => litFirst(lit?.courses)(a, b) || a.title.localeCompare(b.title));

  const pick = (s: Sel) => setSel((cur) => (cur && s && cur.kind === s.kind && cur.id === s.id ? null : s));
  const dimOf = (kind: "page" | "offering" | "course", id: string) =>
    !!lit && !(kind === "page" ? lit.pages : kind === "offering" ? lit.offerings : lit.courses).has(id);

  /* ---- Explore & Home: reorder and switch ---- */
  const savePositions = async (rows: { id: string; position: number }[], column: "position" | "carousel_position") => {
    setMoving(true);
    const results = await Promise.all(rows.map((r) =>
      supabase.from("pages").update(column === "position" ? { position: r.position } : { carousel_position: r.position }).eq("id", r.id)));
    setMoving(false);
    const bad = results.find((r) => r.error);
    if (bad?.error) toast.error(`Order not saved: ${bad.error.message}`);
    await reload();
  };
  const move = (list: CatPage[], i: number, dir: -1 | 1, column: "position" | "carousel_position") => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const rows = renumber(next).map((r) => ({ ...r, position: column === "carousel_position" ? r.position / 10 : r.position }));
    void savePositions(rows, column);
  };
  const setListing = async (p: CatPage, listing: string) => {
    if (listing === "listed" || listing === "featured") {
      const o = p.button_offering_id ? derived.off.get(p.button_offering_id) ?? null : null;
      if (!isReady(pageReadiness(p, o, p.button_offering_id ? derived.lessonsByOffering.get(p.button_offering_id) ?? 0 : 0))) {
        setEditing(p);
        toast.message("Finish the Ready checks first");
        return;
      }
    }
    const { error } = await supabase.from("pages").update({ listing }).eq("id", p.id);
    if (error) toast.error(error.message); else toast.success(`${p.title}: ${LISTING[listing].label}`);
    await reload();
  };

  const tierOf = (p: CatPage) => (p.button_offering_id ? derived.off.get(p.button_offering_id)?.product_tier ?? null : null);
  const onHome = (p: CatPage) => p.listing === "listed" || p.listing === "featured";
  const carousel = data.pages.filter((p) => p.listing === "featured").sort((a, b) => (a.carousel_position ?? 99) - (b.carousel_position ?? 99));
  const rows = ROW_FORMATS.map((t) => ({ tier: t, pages: data.pages.filter((p) => onHome(p) && tierOf(p) === t).sort((a, b) => a.position - b.position) }));
  const notShowing = data.pages.filter((p) => onHome(p) && (!(ROW_FORMATS as readonly string[]).includes(tierOf(p) ?? "") || derived.off.get(p.button_offering_id ?? "")?.status !== "active"));
  const linkOnly = data.pages.filter((p) => p.listing === "link").sort((a, b) => a.title.localeCompare(b.title));

  const selected = sel && (sel.kind === "page" ? data.pages.find((p) => p.id === sel.id)
    : sel.kind === "offering" ? derived.off.get(sel.id) : data.courses.find((c) => c.id === sel.id));

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-4 text-sm">
        <p className="font-medium">Every product has three parts.</p>
        <p className="text-muted-foreground mt-1">
          <b className="text-foreground">Page</b> is what people see (Explore, Home, its address).{" "}
          <b className="text-foreground">Offering</b> is what they pay for: the checkout, price, add-ons.{" "}
          <b className="text-foreground">Content</b> is what they watch. Students are enrolled in an offering.
          A page's button sells one offering; an offering unlocks one or more courses; a course can sit in many offerings.
        </p>
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="home">Explore &amp; Home</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search pages, offerings, courses…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Offerings: Selling</SelectItem>
                <SelectItem value="archived">Offerings: Closed</SelectItem>
                <SelectItem value="draft">Offerings: Draft</SelectItem>
                <SelectItem value="all">Offerings: all</SelectItem>
              </SelectContent>
            </Select>
            {sel && <Button variant="ghost" size="sm" onClick={() => setSel(null)}><X className="h-4 w-4 mr-1" />Clear selection</Button>}
          </div>

          {selected && sel && (
            <div className="bg-card border border-primary/40 rounded-xl p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-xs text-muted-foreground">{sel.kind === "page" ? "Page" : sel.kind === "offering" ? "Offering" : "Content"}</p>
                <p className="font-medium">{(selected as { title: string }).title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connected: {lit?.pages.size ?? 0} page(s) · {lit?.offerings.size ?? 0} offering(s) · {lit?.courses.size ?? 0} course(s)
                </p>
              </div>
              {sel.kind === "page" && (
                <>
                  <Button size="sm" onClick={() => setEditing(selected as CatPage)}><Pencil className="h-4 w-4 mr-1" />Edit page</Button>
                  <Button size="sm" variant="outline" asChild><a href={`/p/${(selected as CatPage).slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Open page</a></Button>
                </>
              )}
              {sel.kind === "offering" && (
                <>
                  <Button size="sm" asChild><Link to={`/admin/offerings/${sel.id}/edit`}><Pencil className="h-4 w-4 mr-1" />Edit offering</Link></Button>
                  <Button size="sm" variant="outline" asChild><a href={`/checkout/${sel.id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Open checkout</a></Button>
                </>
              )}
              {sel.kind === "course" && (
                <>
                  <Button size="sm" asChild><Link to={`/admin/courses/${sel.id}/edit`}><Pencil className="h-4 w-4 mr-1" />Edit course</Link></Button>
                  <Button size="sm" variant="outline" asChild><Link to={`/admin/courses/${sel.id}/curriculum`}>Lessons</Link></Button>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Pages */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pages <span className="text-muted-foreground font-normal">· what people see · {data.pages.length}</span></h2>
                <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1" />New page</Button>
              </div>
              {shownPages.map((p) => {
                const o = p.button_offering_id ? derived.off.get(p.button_offering_id) : null;
                return (
                  <Item key={p.id} active={sel?.kind === "page" && sel.id === p.id} dim={dimOf("page", p.id)} onClick={() => pick({ kind: "page", id: p.id })}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{p.title}</span>
                      <Chip tone={p.listing === "hidden" ? "muted" : p.listing === "link" ? "plain" : "good"} title={LISTING[p.listing]?.hint}>{LISTING[p.listing]?.label}</Chip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      /p/{p.slug} · sells {o ? o.title : "nothing yet"}
                    </p>
                  </Item>
                );
              })}
              {!shownPages.length && <p className="text-sm text-muted-foreground px-1">No pages match.</p>}
            </section>

            {/* Offerings */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Offerings <span className="text-muted-foreground font-normal">· what they pay for · {shownOfferings.length}</span></h2>
                <Button size="sm" variant="outline" asChild><Link to="/admin/offerings/new/edit"><Plus className="h-4 w-4 mr-1" />New offering</Link></Button>
              </div>
              {shownOfferings.map((o) => {
                const n = data.counts.get(o.id);
                const addons = derived.addonsOf.get(o.id) ?? 0;
                return (
                  <Item key={o.id} active={sel?.kind === "offering" && sel.id === o.id} dim={dimOf("offering", o.id)} onClick={() => pick({ kind: "offering", id: o.id })}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{o.title}</span>
                      <Chip tone={o.status === "active" ? "good" : "muted"} title={OFFERING_STATUS[o.status]?.hint}>{OFFERING_STATUS[o.status]?.label ?? o.status}</Chip>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Chip title={ACCESS[o.access]?.hint}>{ACCESS[o.access]?.label ?? o.access}</Chip>
                      {o.access === "buy" && <Chip tone={Number(o.price_inr) > 0 ? "plain" : "warn"}>{inr(o.price_inr)}</Chip>}
                      <Chip tone="muted">{FORMAT[o.product_tier ?? ""] ?? o.product_tier}</Chip>
                      {addons > 0 && <Chip tone="plain">{addons} add-on{addons === 1 ? "" : "s"}</Chip>}
                      {n && (n.students > 0 || n.tagmango > 0) && (
                        <span className="text-[11px] text-muted-foreground">
                          {n.students.toLocaleString("en-IN")} student{n.students === 1 ? "" : "s"}{n.tagmango ? ` · ${n.tagmango.toLocaleString("en-IN")} TagMango` : ""}
                        </span>
                      )}
                    </div>
                  </Item>
                );
              })}
              {!shownOfferings.length && <p className="text-sm text-muted-foreground px-1">No offerings match.</p>}
            </section>

            {/* Content */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Content <span className="text-muted-foreground font-normal">· what they watch · {shownCourses.length}</span></h2>
                <Button size="sm" variant="outline" asChild><Link to="/admin/courses/new/edit"><Plus className="h-4 w-4 mr-1" />New course</Link></Button>
              </div>
              {shownCourses.map((c) => {
                const inN = (derived.offeringsOf.get(c.id) ?? []).length;
                return (
                  <Item key={c.id} active={sel?.kind === "course" && sel.id === c.id} dim={dimOf("course", c.id)} onClick={() => pick({ kind: "course", id: c.id })}>
                    <span className="text-sm font-medium leading-snug">{c.title}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.lessons} lesson{c.lessons === 1 ? "" : "s"} · in {inN} offering{inN === 1 ? "" : "s"}{c.status && c.status !== "published" ? ` · ${c.status}` : ""}
                    </p>
                  </Item>
                );
              })}
              {!shownCourses.length && <p className="text-sm text-muted-foreground px-1">No courses for these offerings.</p>}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="home" className="space-y-5">
          <p className="text-sm text-muted-foreground">
            This is what Explore and Home show, in this order. Use the arrows to reorder. Only pages set to Listed or Featured appear.
            {moving && <Loader2 className="inline h-4 w-4 ml-2 animate-spin" />}
          </p>

          <HomeRow title="Home carousel (Featured)" pages={carousel} offerings={derived.off}
            onMove={(i, d) => move(carousel, i, d, "carousel_position")}
            onEdit={setEditing} action={(p) => ({ label: "Not in carousel", run: () => void setListing(p, "listed") })} />

          {rows.map((r) => (
            <HomeRow key={r.tier} title={ROW_TITLE[r.tier]} pages={r.pages} offerings={derived.off}
              onMove={(i, d) => move(r.pages, i, d, "position")}
              onEdit={setEditing} action={(p) => ({ label: "Hide", run: () => void setListing(p, "link") })} />
          ))}

          {notShowing.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-medium">Listed, but not showing</p>
              <p className="text-xs text-muted-foreground mb-2">Their offering isn't Selling, or its format has no row.</p>
              <ul className="space-y-1">
                {notShowing.map((p) => {
                  const o = derived.off.get(p.button_offering_id ?? "");
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{p.title} <span className="text-muted-foreground">· {o ? `${OFFERING_STATUS[o.status]?.label}, ${FORMAT[o.product_tier ?? ""] ?? o.product_tier}` : "sells nothing"}</span></span>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm font-medium">Link only ({linkOnly.length})</p>
            <p className="text-xs text-muted-foreground mb-2">These pages work at their address but aren't listed anywhere.</p>
            <ul className="space-y-1">
              {linkOnly.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.title} <span className="text-muted-foreground">· /p/{p.slug}</span></span>
                  <span className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => void setListing(p, "listed")}>List it</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      <PageDialog
        open={editing !== null}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        page={editing === "new" ? null : editing}
        offerings={data.offerings}
        lessonsByOffering={derived.lessonsByOffering}
        onSaved={() => void reload()}
      />
    </div>
  );
}

const LISTING_RANK: Record<string, number> = { featured: 3, listed: 2, link: 1, hidden: 0 };

function HomeRow({ title, pages, offerings, onMove, onEdit, action }: {
  title: string;
  pages: CatPage[];
  offerings: Map<string, CatOffering>;
  onMove: (i: number, dir: -1 | 1) => void;
  onEdit: (p: CatPage) => void;
  action: (p: CatPage) => { label: string; run: () => void };
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-medium mb-2">{title} <span className="text-muted-foreground font-normal">· {pages.length}</span></p>
      {!pages.length && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
      <ol className="space-y-1.5">
        {pages.map((p, i) => {
          const o = p.button_offering_id ? offerings.get(p.button_offering_id) : undefined;
          const a = action(p);
          return (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex flex-col">
                <button type="button" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => onMove(i, -1)} className="disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${p.title} down`} disabled={i === pages.length - 1} onClick={() => onMove(i, 1)} className="disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
              </span>
              <span className="flex-1 min-w-0 truncate">
                {p.title}
                {o && <span className="text-muted-foreground"> · {o.access === "buy" ? inr(o.price_inr) : ACCESS[o.access]?.label}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={a.run}>{a.label}</Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
