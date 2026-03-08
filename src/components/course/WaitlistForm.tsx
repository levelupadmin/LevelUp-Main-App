import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCircle2 } from "lucide-react";

interface WaitlistFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  scheduleId?: string;
  courseTitle: string;
}

const WaitlistForm = ({ open, onOpenChange, courseId, scheduleId, courseTitle }: WaitlistFormProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("waitlists").insert({
        course_id: courseId,
        schedule_id: scheduleId || null,
        user_id: user?.id || null,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "You're on the waitlist!", description: "We'll notify you when spots open up." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="rounded-full bg-green-500/10 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">You're on the list!</h3>
              <p className="text-sm text-muted-foreground mt-1">We'll email you at {email} when spots open for {courseTitle}.</p>
            </div>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[hsl(var(--highlight))]" />
            Join Waitlist
          </DialogTitle>
          <DialogDescription>Get notified when spots open up for {courseTitle}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Email *</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Phone (optional)</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 ..." className="mt-1" />
          </div>
          <Button onClick={handleSubmit} disabled={!name.trim() || !email.trim() || submitting} className="w-full">
            {submitting ? "Joining..." : "Join Waitlist"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WaitlistForm;
