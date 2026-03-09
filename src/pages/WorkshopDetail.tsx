import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { getWorkshopById } from "@/data/learningData";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Clock, Users, Calendar, CheckCircle2, Play, Star } from "lucide-react";

const WorkshopDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const workshop = getWorkshopById(slug || "");
  const [registered, setRegistered] = useState(false);

  if (!workshop) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground">Workshop not found</p>
        </div>
      </AppShell>
    );
  }

  const handleRegister = () => {
    setRegistered(true);
    toast({
      title: "Registered! 🎉",
      description: `You're in for "${workshop.title}". Check your email for details.`,
    });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4 py-6 lg:p-6 space-y-6">
        {/* Back */}
        <button
          onClick={() => navigate("/learn/workshops")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> All Workshops
        </button>

        {/* Instructor hero */}
        <div className="flex flex-col sm:flex-row items-start gap-5 rounded-xl border border-border bg-card p-5">
          <img
            src={workshop.instructorImage}
            alt={workshop.instructor}
            className="h-24 w-24 rounded-xl object-cover border border-border"
          />
          <div className="flex-1 min-w-0">
            <Badge variant="secondary" className="text-[10px] mb-2">{workshop.category}</Badge>
            <h1 className="text-xl font-bold text-foreground lg:text-2xl leading-tight">{workshop.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">by <span className="font-semibold text-foreground">{workshop.instructor}</span></p>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{workshop.instructorBio}</p>
          </div>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Date & Time</p>
              <p className="text-sm font-semibold text-foreground">{workshop.date} · {workshop.time}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-semibold text-foreground">{workshop.duration}</p>
            </div>
          </div>
          {!workshop.isPast && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Seats</p>
                <p className="text-sm font-semibold text-foreground">{workshop.seatsRemaining}/{workshop.seatsTotal} remaining</p>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <h2 className="text-base font-bold text-foreground mb-2">About this workshop</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{workshop.description}</p>
        </div>

        {/* What you'll learn */}
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">What you'll learn</h2>
          <ul className="space-y-2">
            {workshop.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        {/* Price + CTA */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-foreground">₹{workshop.price}</p>
            <p className="text-xs text-muted-foreground mt-0.5">One-time · Includes replay access</p>
          </div>
          {workshop.isPast && workshop.hasReplay ? (
            <Button className="gap-2" onClick={() => toast({ title: "Replay loading...", description: "Replay player coming soon." })}>
              <Play className="h-4 w-4" /> Watch Replay
            </Button>
          ) : registered ? (
            <Button disabled className="gap-2 bg-[hsl(var(--success))] text-background">
              <CheckCircle2 className="h-4 w-4" /> Registered
            </Button>
          ) : workshop.seatsRemaining <= 0 ? (
            <Button disabled>Sold Out</Button>
          ) : (
            <Button
              onClick={handleRegister}
              className="gap-2 bg-[hsl(var(--highlight))] text-background hover:bg-[hsl(var(--highlight))]/90"
            >
              Register Now
            </Button>
          )}
        </div>

        {/* Testimonials */}
        {workshop.testimonials.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">What past attendees say</h2>
            <div className="space-y-3">
              {workshop.testimonials.map((t, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-3 w-3 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{t.text}"</p>
                  <p className="text-xs text-foreground font-semibold mt-2">— {t.author}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ */}
        {workshop.faq.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Frequently Asked Questions</h2>
            <Accordion type="multiple" className="space-y-2">
              {workshop.faq.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="rounded-lg border border-border bg-card overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline text-sm font-semibold text-foreground text-left">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 text-sm text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default WorkshopDetail;
