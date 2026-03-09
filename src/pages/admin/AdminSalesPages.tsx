import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Search, Plus, MoreHorizontal, ArrowLeft, Trash2,
  Upload, Save, X, Link2, Tag, Eye, ExternalLink, Video,
  FileText, DollarSign, Settings2, Package, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const courseTypeLabel: Record<string, string> = {
  masterclass: "Masterclass",
  workshop: "Workshop",
  cohort: "Cohort",
};

const courseTypeStyles: Record<string, string> = {
  masterclass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  workshop: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cohort: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

// ─── Hooks ───
const useSalesPages = () =>
  useQuery({
    queryKey: ["admin-sales-pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_pages" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

const useSalesPageCourses = (salesPageId: string | null) =>
  useQuery({
    queryKey: ["admin-sales-page-courses", salesPageId],
    enabled: !!salesPageId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_page_courses" as any).select("*").eq("sales_page_id", salesPageId!);
      if (error) throw error;
      return data as any[];
    },
  });

const useSalesPagePricingVariants = (salesPageId: string | null) =>
  useQuery({
    queryKey: ["admin-sales-pricing", salesPageId],
    enabled: !!salesPageId,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_pricing_variants").select("*").eq("sales_page_id", salesPageId!).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

const useCourses = () =>
  useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title, slug, course_type, status, thumbnail_url").order("title");
      if (error) throw error;
      return data as any[];
    },
  });

// ─── Main Component ───
const AdminSalesPages = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const [search, setSearch] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [newPage, setNewPage] = useState({ title: "", slug: "", course_type_hint: "masterclass" });
  const [activeTab, setActiveTab] = useState("content");

  const { data: salesPages = [], isLoading } = useSalesPages();
  const { data: taggedCourses = [] } = useSalesPageCourses(selectedPageId);
  const { data: pricingVariants = [] } = useSalesPagePricingVariants(selectedPageId);
  const { data: allCourses = [] } = useCourses();

  const selectedPage = salesPages.find((p: any) => p.id === selectedPageId);

  const filteredPages = salesPages.filter((p: any) =>
    search === "" || p.title.toLowerCase().includes(search.toLowerCase())
  );

  // ── Mutations ──
  const createSalesPage = useMutation({
    mutationFn: async (page: any) => {
      const { data, error } = await supabase.from("sales_pages" as any).insert(page).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pages"] });
      toast({ title: "Sales page created" });
      setShowCreateDialog(false);
      setNewPage({ title: "", slug: "", course_type_hint: "masterclass" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateSalesPage = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from("sales_pages" as any).update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pages"] });
      toast({ title: "Sales page updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteSalesPage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_pages" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pages"] });
      toast({ title: "Sales page deleted" });
      setShowDeleteDialog(null);
      setSelectedPageId(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Course tagging
  const tagCourse = useMutation({
    mutationFn: async ({ salesPageId, courseId }: { salesPageId: string; courseId: string }) => {
      const { error } = await supabase.from("sales_page_courses" as any).insert({ sales_page_id: salesPageId, course_id: courseId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-page-courses"] });
      toast({ title: "Course tagged" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const untagCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_page_courses" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-page-courses"] });
      toast({ title: "Course untagged" });
    },
  });

  // Pricing variants (now scoped to sales_page_id)
  const createPricingVariant = useMutation({
    mutationFn: async (variant: any) => {
      const { error } = await supabase.from("course_pricing_variants").insert(variant);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pricing"] });
      toast({ title: "Pricing variant added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updatePricingVariant = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from("course_pricing_variants").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pricing"] });
      toast({ title: "Pricing variant updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deletePricingVariant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_pricing_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales-pricing"] });
      toast({ title: "Pricing variant removed" });
    },
  });

  // ─── DETAIL VIEW ───
  if (selectedPage) {
    const taggedCourseIds = taggedCourses.map((tc: any) => tc.course_id);
    const availableCourses = allCourses.filter((c: any) => !taggedCourseIds.includes(c.id));

    return (
      <AdminLayout>
        <div className="space-y-5">
          <button onClick={() => { setSelectedPageId(null); setActiveTab("content"); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to sales pages
          </button>

          {/* Header */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-32 space-y-2">
                <div className="aspect-video rounded-lg overflow-hidden bg-secondary border border-border">
                  {selectedPage.hero_image_url ? (
                    <img src={selectedPage.hero_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <label className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                  <Upload className="h-3 w-3" />
                  {selectedPage.hero_image_url ? "Change" : "Upload"}
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const path = `sales-pages/${selectedPage.id}-hero.${file.name.split(".").pop()}`;
                    const { error: err } = await supabase.storage.from("course-content").upload(path, file, { upsert: true });
                    if (err) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); return; }
                    const { data: u } = supabase.storage.from("course-content").getPublicUrl(path);
                    updateSalesPage.mutate({ id: selectedPage.id, hero_image_url: u.publicUrl });
                  }} />
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-foreground truncate">{selectedPage.title}</h2>
                  <Badge variant="outline" className={courseTypeStyles[selectedPage.course_type_hint] || ""}>
                    {courseTypeLabel[selectedPage.course_type_hint] || selectedPage.course_type_hint}
                  </Badge>
                  <Badge variant="outline" className={selectedPage.is_published ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-muted text-muted-foreground border-border"}>
                    {selectedPage.is_published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">/{selectedPage.slug} • {taggedCourses.length} courses tagged • {pricingVariants.length} pricing variants</p>
              </div>

              <div className="flex gap-2 shrink-0">
                {!selectedPage.is_published ? (
                  <Button size="sm" onClick={() => updateSalesPage.mutate({ id: selectedPage.id, is_published: true })} className="bg-green-600 hover:bg-green-700 text-white">Publish</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => updateSalesPage.mutate({ id: selectedPage.id, is_published: false })}>Unpublish</Button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-secondary/50 border border-border">
              <TabsTrigger value="content" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Content</TabsTrigger>
              <TabsTrigger value="pricing" className="gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />Pricing</TabsTrigger>
              <TabsTrigger value="courses" className="gap-1.5 text-xs"><Package className="h-3.5 w-3.5" />Courses</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />Settings</TabsTrigger>
            </TabsList>

            {/* ── CONTENT TAB ── */}
            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h3 className="text-base font-semibold text-foreground">Page Content</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
                    <Input defaultValue={selectedPage.title} onBlur={(e) => updateSalesPage.mutate({ id: selectedPage.id, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug</label>
                    <Input defaultValue={selectedPage.slug} onBlur={(e) => updateSalesPage.mutate({ id: selectedPage.id, slug: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Short Description</label>
                  <Input defaultValue={selectedPage.description || ""} onBlur={(e) => updateSalesPage.mutate({ id: selectedPage.id, description: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Trailer / Preview Video URL</label>
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    defaultValue={selectedPage.trailer_url || ""}
                    onBlur={(e) => updateSalesPage.mutate({ id: selectedPage.id, trailer_url: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Shown on the sales page for non-enrolled users</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Presale Description (Sales Copy)</label>
                  <Textarea
                    className="min-h-[150px]"
                    placeholder="Detailed sales copy, feature bullets, social proof, what students will learn..."
                    defaultValue={selectedPage.presale_description || ""}
                    onBlur={(e) => updateSalesPage.mutate({ id: selectedPage.id, presale_description: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── PRICING TAB ── */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Pricing Variants</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Create multiple price points for A/B testing. Only one shows in-app; others can be used in ads.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    // Need a course_id for the FK - use first tagged course or a dummy
                    const firstCourseId = taggedCourses[0]?.course_id;
                    if (!firstCourseId) {
                      toast({ title: "Tag a course first", description: "You need at least one tagged course to create pricing variants.", variant: "destructive" });
                      return;
                    }
                    createPricingVariant.mutate({
                      course_id: firstCourseId,
                      sales_page_id: selectedPage.id,
                      label: "New Variant",
                      price: 0,
                      sort_order: pricingVariants.length,
                    });
                  }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Variant
                  </Button>
                </div>

                {pricingVariants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No pricing variants yet. Tag a course first, then add pricing variants.</p>
                ) : (
                  <div className="space-y-3">
                    {pricingVariants.map((v: any) => (
                      <div key={v.id} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Label</label>
                              <Input defaultValue={v.label} className="h-8 text-sm" onBlur={(e) => updatePricingVariant.mutate({ id: v.id, label: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Price (₹)</label>
                              <Input type="number" defaultValue={v.price} className="h-8 text-sm" onBlur={(e) => updatePricingVariant.mutate({ id: v.id, price: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Razorpay Link</label>
                              <Input placeholder="https://rzp.io/..." defaultValue={v.payment_link || ""} className="h-8 text-sm" onBlur={(e) => updatePricingVariant.mutate({ id: v.id, payment_link: e.target.value })} />
                            </div>
                          </div>
                          <button onClick={() => deletePricingVariant.mutate(v.id)} className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors mt-4">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={v.is_active_on_site}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  pricingVariants.filter((pv: any) => pv.id !== v.id && pv.is_active_on_site).forEach((pv: any) => {
                                    updatePricingVariant.mutate({ id: pv.id, is_active_on_site: false });
                                  });
                                }
                                updatePricingVariant.mutate({ id: v.id, is_active_on_site: checked });
                              }}
                            />
                            <label className="text-xs text-muted-foreground">Show in app</label>
                            {v.is_active_on_site && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">Active</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={v.is_active_for_ads}
                              onCheckedChange={(checked) => updatePricingVariant.mutate({ id: v.id, is_active_for_ads: checked })}
                            />
                            <label className="text-xs text-muted-foreground">Active for ads</label>
                          </div>
                        </div>
                        {v.payment_link && (
                          <div className="flex items-center gap-2">
                            <Input className="flex-1 text-xs h-7 font-mono" value={v.payment_link} readOnly />
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                              navigator.clipboard.writeText(v.payment_link);
                              toast({ title: "Link copied!" });
                            }}>
                              <Link2 className="h-3 w-3" /> Copy
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── COURSES TAB ── */}
            <TabsContent value="courses" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Tagged Courses</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Purchasing any pricing variant grants access to all tagged courses below.</p>
                </div>

                <div className="space-y-2">
                  {taggedCourses.map((tc: any) => {
                    const course = allCourses.find((c: any) => c.id === tc.course_id);
                    return (
                      <div key={tc.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {course?.thumbnail_url && (
                            <img src={course.thumbnail_url} alt="" className="h-8 w-12 rounded object-cover" />
                          )}
                          <div>
                            <span className="text-sm font-medium text-foreground">{course?.title || tc.course_id}</span>
                            {course?.course_type && (
                              <Badge variant="outline" className={`ml-2 text-[10px] ${courseTypeStyles[course.course_type] || ""}`}>
                                {courseTypeLabel[course.course_type] || course.course_type}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <button onClick={() => untagCourse.mutate(tc.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {taggedCourses.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No courses tagged yet. Add courses that this sales page will grant access to.</p>
                )}

                <Select onValueChange={(courseId) => {
                  if (courseId && selectedPage) {
                    tagCourse.mutate({ salesPageId: selectedPage.id, courseId });
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="+ Tag a course to this sales page..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title} ({courseTypeLabel[c.course_type] || c.course_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* ── SETTINGS TAB ── */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h3 className="text-base font-semibold text-foreground">Page Settings</h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-foreground">Course Type Hint</span>
                      <p className="text-[10px] text-muted-foreground">Affects CTA style (cohort → application form, others → payment)</p>
                    </div>
                    <Select defaultValue={selectedPage.course_type_hint} onValueChange={(v) => updateSalesPage.mutate({ id: selectedPage.id, course_type_hint: v })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masterclass">Masterclass</SelectItem>
                        <SelectItem value="workshop">Workshop</SelectItem>
                        <SelectItem value="cohort">Cohort</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-foreground">Show Application Form</span>
                      <p className="text-[10px] text-muted-foreground">For cohorts — show an application form instead of direct payment</p>
                    </div>
                    <Switch
                      checked={selectedPage.show_application_form || false}
                      onCheckedChange={(v) => updateSalesPage.mutate({ id: selectedPage.id, show_application_form: v })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-foreground">Published</span>
                      <p className="text-[10px] text-muted-foreground">Make this sales page visible to students</p>
                    </div>
                    <Switch
                      checked={selectedPage.is_published || false}
                      onCheckedChange={(v) => updateSalesPage.mutate({ id: selectedPage.id, is_published: v })}
                    />
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              {isSuperAdmin && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
                  <p className="text-xs text-muted-foreground">Deleting a sales page will also remove all its pricing variants and course tags.</p>
                  <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(selectedPage.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Sales Page
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Delete Confirmation */}
        <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Sales Page</DialogTitle>
              <DialogDescription>This will permanently delete the sales page and all associated pricing variants.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => showDeleteDialog && deleteSalesPage.mutate(showDeleteDialog)} disabled={deleteSalesPage.isPending}>
                {deleteSalesPage.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    );
  }

  // ─── LIST VIEW ───
  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sales Pages</h1>
            <p className="text-sm text-muted-foreground">Manage presale pages, pricing variants, and course bundles</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
          >
            <Plus className="h-4 w-4 mr-1" /> Create Sales Page
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search sales pages..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total", value: salesPages.length },
            { label: "Published", value: salesPages.filter((p: any) => p.is_published).length },
            { label: "Draft", value: salesPages.filter((p: any) => !p.is_published).length },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5">
              <span className="text-lg font-bold text-foreground">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Courses</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPages.map((page: any) => (
                    <tr key={page.id} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedPageId(page.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block max-w-[280px]">{page.title}</span>
                            <span className="text-xs text-muted-foreground">/{page.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline" className={courseTypeStyles[page.course_type_hint] || ""}>
                          {courseTypeLabel[page.course_type_hint] || page.course_type_hint}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={page.is_published ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-muted text-muted-foreground border-border"}>
                          {page.is_published ? "Published" : "Draft"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">—</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedPageId(page.id)}>View & Edit</DropdownMenuItem>
                            {page.is_published ? (
                              <DropdownMenuItem onClick={() => updateSalesPage.mutate({ id: page.id, is_published: false })}>Unpublish</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => updateSalesPage.mutate({ id: page.id, is_published: true })}>Publish</DropdownMenuItem>
                            )}
                            {isSuperAdmin && (
                              <DropdownMenuItem onClick={() => setShowDeleteDialog(page.id)} className="text-destructive">Delete</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && filteredPages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No sales pages found. Create one to start selling courses.</div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Sales Page</DialogTitle>
            <DialogDescription>Set up a new presale/payment page for your courses</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["masterclass", "workshop", "cohort"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewPage({ ...newPage, course_type_hint: t })}
                    className={`rounded-lg border p-3 text-center transition-colors ${
                      newPage.course_type_hint === t
                        ? "border-[hsl(var(--highlight))] bg-[hsl(var(--highlight))]/10"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">{courseTypeLabel[t]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
              <Input value={newPage.title} onChange={(e) => setNewPage({ ...newPage, title: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug *</label>
              <Input value={newPage.slug} onChange={(e) => setNewPage({ ...newPage, slug: e.target.value })} placeholder="auto-generated" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!newPage.title || !newPage.slug) { toast({ title: "Title and slug required", variant: "destructive" }); return; }
                createSalesPage.mutate(newPage);
              }}
              disabled={createSalesPage.isPending}
              className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
            >
              {createSalesPage.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Sales Page</DialogTitle>
            <DialogDescription>This will permanently delete the sales page and all associated pricing variants.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => showDeleteDialog && deleteSalesPage.mutate(showDeleteDialog)} disabled={deleteSalesPage.isPending}>
              {deleteSalesPage.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSalesPages;
