import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap } from "lucide-react";
import type { CourseDetailed } from "@/data/learningData";

interface PurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseDetailed;
  onPurchase: (type: "one-time" | "subscription") => void;
}

const PurchaseModal = ({ open, onOpenChange, course, onPurchase }: PurchaseModalProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md border-border bg-card p-0 gap-0">
      <div className="relative h-32 overflow-hidden rounded-t-lg">
        <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-sm font-bold text-foreground">{course.title}</p>
          <p className="text-xs text-muted-foreground">{course.instructor}</p>
        </div>
      </div>

      <DialogHeader className="px-5 pt-4 pb-0">
        <DialogTitle className="text-base">Choose your plan</DialogTitle>
        <DialogDescription className="text-xs">Unlock this masterclass and start learning today.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3 p-5">
        {/* One-time */}
        <button
          onClick={() => onPurchase("one-time")}
          className="group w-full rounded-lg border border-border bg-secondary/30 p-4 text-left transition-colors hover:border-foreground/20"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Buy this course</span>
            </div>
            <span className="text-lg font-bold text-foreground">₹{course.price.toLocaleString()}</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">One-time payment · Lifetime access</p>
          <ul className="mt-3 space-y-1.5">
            {["Full course access", "All project files", "Certificate of completion", "Community access"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-foreground/60" />
                {item}
              </li>
            ))}
          </ul>
        </button>

        {/* Subscription */}
        <button
          onClick={() => onPurchase("subscription")}
          className="group relative w-full rounded-lg border border-foreground/20 bg-secondary/30 p-4 text-left transition-colors hover:border-foreground/40"
        >
          <Badge className="absolute -top-2.5 right-3 bg-foreground text-background text-[10px] font-bold px-2">
            BEST VALUE
          </Badge>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Subscribe to all</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">₹{course.subscriptionPrice}/mo</span>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Access every masterclass · Cancel anytime</p>
          <ul className="mt-3 space-y-1.5">
            {["All masterclasses included", "New courses every month", "Priority community access", "Exclusive workshops", "Cancel anytime"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-foreground/60" />
                {item}
              </li>
            ))}
          </ul>
        </button>
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="text-center text-[10px] text-muted-foreground">
          Secure payment · 7-day money-back guarantee · GST included
        </p>
      </div>
    </DialogContent>
  </Dialog>
);

export default PurchaseModal;
