import AppShell from "@/components/layout/AppShell";
import { getCohortById } from "@/data/cohortData";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Clock, Users, CalendarDays, Star, CheckCircle2, Play, MapPin,
  GraduationCap, IndianRupee, ChevronRight, Award, Quote, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CohortDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const cohort = getCohortById(slug || "");
  const [showFullCriteria, setShowFullCriteria] = useState(false);

  if (!cohort) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <GraduationCap className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h1 className="text-xl font-bold text-foreground">Cohort not found</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-4">This cohort may have been removed</p>
          <Button size="sm" onClick={() => navigate("/learn")}>Back to Learn</Button>
        </div>
      </AppShell>
    );
  }

  const seatsLeft = cohort.totalSeats - cohort.filledSeats;
  const seatsFraction = (cohort.filledSeats / cohort.totalSeats) * 100;

  const handleApply = () => {
    if (cohort.userAccepted) {
      navigate(`/learn/cohort/${cohort.id}/dashboard`);
    } else {
      navigate(`/learn/cohort/${cohort.id}/apply`);
    }
  };

  const handleWaitlist = () => {
    toast({ title: "Added to waitlist", description: "We'll notify you when applications reopen." });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8 p-4 lg:p-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-xl border border-border">
          <div className="relative h-56 sm:h-72">
            <img src={cohort.thumbnail} alt={cohort.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          </div>
          <div className="relative -mt-20 space-y-4 p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{cohort.category}</Badge>
              <Badge variant="secondary">{cohort.duration}</Badge>
              {cohort.isApplicationOpen ? (
                <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Applications Open</Badge>
              ) : (
                <Badge variant="destructive">Applications Closed</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{cohort.title}</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{cohort.subtitle}</p>

            {/* Mentors row */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {cohort.mentors.map((m) => (
                  <img key={m.id} src={m.image} alt={m.name} className="h-8 w-8 rounded-full border-2 border-card object-cover" />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                with {cohort.mentors.map((m) => m.name).join(" & ")}
              </span>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Starts {cohort.startDate}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {cohort.duration}</span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {seatsLeft > 0 ? `${seatsLeft} seats left` : "Fully booked"}</span>
            </div>

            {/* Seats bar */}
            <div className="max-w-xs space-y-1">
              <Progress value={seatsFraction} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">{cohort.filledSeats}/{cohort.totalSeats} seats filled</p>
            </div>

            {/* Outcome badge */}
            <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3 max-w-md">
              <Award className="h-4 w-4 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-foreground">Outcome</p>
                <p className="text-xs text-muted-foreground">{cohort.outcome}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Overview video placeholder */}
        <div className="relative aspect-video rounded-xl border border-border bg-card overflow-hidden">
          <img src={cohort.thumbnail} alt="Overview" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm border border-foreground/20">
              <Play className="h-6 w-6 text-foreground ml-1" />
            </div>
            <p className="text-sm font-medium text-foreground">Watch Cohort Overview</p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">About this Cohort</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{cohort.description}</p>
        </div>

        {/* Week-by-week Syllabus */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">Week-by-Week Syllabus</h2>
          <Accordion type="multiple" className="space-y-2">
            {cohort.syllabus.map((week) => (
              <AccordionItem key={week.week} value={`week-${week.week}`} className="rounded-lg border border-border bg-card px-4">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                      {week.week}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{week.title}</p>
                      <p className="text-xs text-muted-foreground">{week.description}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pl-10 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {week.topics.map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-[10px]">{topic}</Badge>
                    ))}
                  </div>
                  {week.assignment && (
                    <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-2.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Assignment</p>
                        <p className="text-xs text-muted-foreground">{week.assignment}</p>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Mentors */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">Your Mentors</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {cohort.mentors.map((mentor) => (
              <div key={mentor.id} className="flex gap-4 rounded-lg border border-border bg-card p-4">
                <img src={mentor.image} alt={mentor.name} className="h-16 w-16 rounded-full object-cover" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">{mentor.name}</h3>
                  <p className="text-xs text-[hsl(var(--highlight))]">{mentor.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{mentor.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alumni outcomes / Testimonials */}
        {cohort.testimonials.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Alumni Outcomes</h2>
            <div className="space-y-3">
              {cohort.testimonials.map((t) => (
                <div key={t.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <img src={t.avatar} alt={t.name} className="h-10 w-10 rounded-full object-cover" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.cohortBatch}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-[10px]">{t.outcome}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Quote className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{t.quote}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Demo Day Showcase */}
        {cohort.demoProjects.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Demo Day Showcase</h2>
            <p className="text-xs text-muted-foreground">Work created by previous cohort members</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cohort.demoProjects.map((project) => (
                <div key={project.id} className="group overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative h-32">
                    <img src={project.image} alt={project.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                  </div>
                  <div className="p-3 space-y-1">
                    <h3 className="text-sm font-bold text-foreground">{project.title}</h3>
                    <p className="text-[10px] text-[hsl(var(--highlight))]">by {project.creator}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selection Criteria */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Selection Criteria</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            {cohort.selectionCriteria.slice(0, showFullCriteria ? undefined : 3).map((criteria, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">{criteria}</p>
              </div>
            ))}
            {cohort.selectionCriteria.length > 3 && !showFullCriteria && (
              <button onClick={() => setShowFullCriteria(true)} className="text-xs text-foreground font-medium hover:underline">
                + {cohort.selectionCriteria.length - 3} more
              </button>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-lg font-bold text-foreground">Investment</h2>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[180px] rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Payment</p>
              <p className="text-2xl font-bold text-foreground">₹{cohort.price.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">One-time payment · Full access</p>
            </div>
            <div className="flex-1 min-w-[180px] rounded-lg border border-[hsl(var(--highlight))]/30 bg-[hsl(var(--highlight))]/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-[hsl(var(--highlight))] uppercase tracking-wider">EMI Available</p>
              <p className="text-2xl font-bold text-foreground">₹{cohort.emiPrice.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-[10px] text-muted-foreground">{cohort.emiMonths} monthly installments · No interest</p>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            {cohort.userAccepted ? (
              <Button onClick={handleApply} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Go to Cohort Dashboard
              </Button>
            ) : cohort.isApplicationOpen ? (
              <Button onClick={handleApply} className="gap-2">
                Apply Now
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleWaitlist} variant="secondary" className="gap-2">
                Join Waitlist
              </Button>
            )}
            {cohort.userApplicationStatus && !cohort.userAccepted && (
              <Button variant="outline" onClick={() => navigate(`/learn/cohort/${cohort.id}/apply`)}>
                View Application Status
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Application deadline: {cohort.applicationDeadline} · Selection results within 5 business days
          </p>
        </div>
      </div>
    </AppShell>
  );
};

export default CohortDetail;
