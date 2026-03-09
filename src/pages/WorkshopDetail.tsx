import { useParams, useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import { mockWorkshops, mockCourses } from "@/data/learnMockData";
import { Calendar, Clock, Users, User, Check, Download, Play, FileText, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const WorkshopDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const workshop = mockWorkshops.find((w) => w.slug === slug);

  if (!workshop) {
    return <AppShell><div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Workshop not found.</p></div></AppShell>;
  }

  const { isUpcoming, isRegistered, resourcesEnabled } = workshop;
  const workshopDate = new Date(workshop.date);
  const now = new Date();
  const daysUntil = Math.max(0, Math.ceil((workshopDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const relatedCourse = workshop.relatedCourseSlug ? mockCourses.find((c) => c.slug === workshop.relatedCourseSlug) : null;

  const isPrePurchase = !isRegistered;
  const isBeforeEvent = isRegistered && isUpcoming;
  const isAfterNoResources = isRegistered && !isUpcoming && !resourcesEnabled;
  const isAfterWithResources = isRegistered && !isUpcoming && resourcesEnabled;

  const hasTabs: string[] = [];
  if (workshop.recordingUrl) hasTabs.push("recording");
  if (workshop.slidesUrl) hasTabs.push("slides");
  if (workshop.resources && workshop.resources.length > 0) hasTabs.push("resources");

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 lg:px-8 space-y-6">
        {isPrePurchase && (
          <>
            <div className="relative aspect-video rounded-xl bg-secondary border border-border overflow-hidden">
              <div className="absolute top-3 left-3">
                <Badge className="bg-[hsl(var(--highlight))]/90 text-[hsl(var(--highlight-foreground))] gap-1">
                  <Calendar className="h-3 w-3" />
                  {workshopDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {workshop.time}
                </Badge>
              </div>
              {isUpcoming && daysUntil > 0 && (
                <div className="absolute top-3 right-3">
                  <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">Starts in {daysUntil} day{daysUntil !== 1 ? "s" : ""}</Badge>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">{workshop.title}</h1>
              <p className="text-sm text-muted-foreground mb-4">{workshop.description}</p>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center"><User className="h-4 w-4 text-muted-foreground" /></div>
                <span className="text-sm text-foreground">{workshop.instructor.name}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Calendar, label: "Date", value: workshopDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) },
                { icon: Clock, label: "Duration", value: workshop.duration },
                { icon: Users, label: "Seats", value: `${workshop.capacity - workshop.registered} left` },
                { icon: FileText, label: "Price", value: `₹${workshop.price}` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-lg bg-secondary p-3 text-center">
                  <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <Button className="w-full bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90 text-base py-6">
              Register for ₹{workshop.price}
            </Button>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-3">What you'll learn</h3>
              <ul className="space-y-2">
                {workshop.whatYoullLearn.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-base font-semibold text-foreground mb-2">About the Instructor</h3>
              <p className="text-sm text-muted-foreground">{workshop.instructor.bio}</p>
            </div>
            {workshop.testimonials.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">What attendees say</h3>
                <div className="space-y-3">
                  {workshop.testimonials.map((t, i) => (
                    <div key={i} className="rounded-lg border border-border p-4">
                      <p className="text-sm text-muted-foreground italic">"{t.text}"</p>
                      <p className="text-xs text-foreground mt-2 font-medium">— {t.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {workshop.faq.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">FAQ</h3>
                <Accordion type="single" collapsible className="space-y-2">
                  {workshop.faq.map((f, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-lg overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 text-sm text-foreground hover:no-underline">{f.q}</AccordionTrigger>
                      <AccordionContent className="px-4 pb-3 text-sm text-muted-foreground">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </>
        )}

        {isBeforeEvent && (
          <div className="max-w-lg mx-auto text-center space-y-6 py-12">
            <div className="rounded-xl border border-border bg-card p-8 space-y-4">
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1"><Check className="h-3 w-3" /> You're registered!</Badge>
              <h1 className="text-xl font-bold text-foreground">{workshop.title}</h1>
              <p className="text-sm text-muted-foreground">{workshopDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {workshop.time}</p>
              {daysUntil > 0 && <p className="text-lg font-semibold text-[hsl(var(--highlight))]">Starts in {daysUntil} day{daysUntil !== 1 ? "s" : ""}</p>}
              <Button className="w-full bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90 text-base py-6 gap-2" asChild>
                <a href={workshop.zoomLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Join Live Session</a>
              </Button>
              <Button variant="outline" className="w-full gap-2"><Calendar className="h-4 w-4" /> Add to Calendar</Button>
            </div>
          </div>
        )}

        {isAfterNoResources && (
          <div className="max-w-lg mx-auto text-center space-y-4 py-12">
            <div className="rounded-xl border border-border bg-card p-8 space-y-4">
              <h2 className="text-xl font-bold text-foreground">Thank you for attending!</h2>
              <p className="text-sm text-muted-foreground">{workshop.title}</p>
              <div className="flex items-center justify-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /><span className="text-sm">Resources will be shared soon.</span></div>
            </div>
          </div>
        )}

        {isAfterWithResources && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">{workshop.title}</h1>
              <p className="text-xs text-muted-foreground">{workshopDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · {workshop.instructor.name}</p>
            </div>
            {hasTabs.length > 0 && (
              <Tabs defaultValue={hasTabs[0]} className="space-y-4">
                <TabsList className="bg-secondary">
                  {hasTabs.includes("recording") && <TabsTrigger value="recording">Recording</TabsTrigger>}
                  {hasTabs.includes("slides") && <TabsTrigger value="slides">Slides</TabsTrigger>}
                  {hasTabs.includes("resources") && <TabsTrigger value="resources">Resources</TabsTrigger>}
                </TabsList>
                {hasTabs.includes("recording") && (
                  <TabsContent value="recording">
                    <div className="aspect-video rounded-xl bg-secondary border border-border flex items-center justify-center">
                      <Play className="h-10 w-10 text-[hsl(var(--highlight))]" />
                    </div>
                  </TabsContent>
                )}
                {hasTabs.includes("slides") && (
                  <TabsContent value="slides">
                    <div className="rounded-xl border border-border p-8 text-center space-y-3">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-sm text-foreground font-medium">Workshop Slides</p>
                      <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Download PDF</Button>
                    </div>
                  </TabsContent>
                )}
                {hasTabs.includes("resources") && (
                  <TabsContent value="resources" className="space-y-3">
                    {workshop.resources?.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div><p className="text-sm font-medium text-foreground">{r.title}</p><p className="text-xs text-muted-foreground">{r.size}</p></div>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1"><Download className="h-3.5 w-3.5" /> Download</Button>
                      </div>
                    ))}
                  </TabsContent>
                )}
              </Tabs>
            )}
            {relatedCourse && (
              <button onClick={() => navigate(`/learn/course/${relatedCourse.slug}`)} className="w-full rounded-xl border border-border bg-gradient-to-r from-card to-secondary p-5 text-left hover:border-[hsl(var(--highlight))/30] transition-all">
                <p className="text-xs text-[hsl(var(--highlight))] mb-1">Go deeper</p>
                <h3 className="text-base font-semibold text-foreground mb-1">{relatedCourse.title}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1">Full masterclass <ChevronRight className="h-3.5 w-3.5" /></p>
              </button>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
};

export default WorkshopDetail;
