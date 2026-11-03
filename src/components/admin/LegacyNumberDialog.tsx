import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Country } from "react-phone-number-input";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import AdminPhoneInput, { phoneProblem, typedNumber } from "@/components/admin/AdminPhoneInput";

/**
 * "Change number" for a TagMango buyer with no account yet: an "unclaimed
 * legacy" row on Users (founder, 3 Nov 2026). Their purchases sit under the
 * number TagMango holds, so a buyer whose number there is wrong signs in to an
 * empty account. admin-update-user (action move_legacy) moves the purchases to
 * the right number and attaches them to an account at once, so the student
 * only has to sign in. It asks first when that number already has an account.
 */

export interface LegacyBuyer {
  full_name: string | null;
  email: string | null;
  /** As legacy_enrolments holds it: the key the purchases are moved by. */
  phone: string | null;
  purchase_count?: number | null;
}

type Outcome =
  | { ok: true; created_account: boolean; phone: string; rows: number; claimed: number; blocked: number }
  | { ok: false; code: string; error: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default function LegacyNumberDialog({ buyer, onClose, onDone }: {
  buyer: LegacyBuyer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country | undefined>("IN");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => { setPhone(""); setCountry("IN"); setConfirm(null); }, [buyer]);

  const number = typedNumber(phone, country);
  const problem = phoneProblem(phone, country);

  const save = async (confirmExisting = false) => {
    if (!buyer?.phone || !number) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: { action: "move_legacy", legacy_phone: buyer.phone, phone: number, confirm_existing_account: confirmExisting || undefined },
    });
    setSaving(false);
    const out = data as Outcome | null;
    if (out && !out.ok && out.code === "needs_confirmation") { setConfirm(out.error); return; }
    if (!out?.ok) {
      // Business errors come back as data on 200; a thrown error is the gateway.
      let message = out?.error;
      if (!message && error) {
        const ctx = (error as { context?: Response }).context;
        try { message = ctx ? ((await ctx.json()) as { error?: string }).error : undefined; } catch { /* not JSON */ }
        message = message || error.message;
      }
      toast({ title: "Couldn't change the number", description: message || "Please try again.", variant: "destructive" });
      return;
    }
    const attached = out.rows - out.blocked;
    toast({
      title: "Number changed",
      description:
        `${out.created_account ? `Account opened on ${out.phone}` : `Attached to the account on ${out.phone}`}: ${plural(attached, "purchase")}. They can sign in with that number now.` +
        (out.blocked ? ` ${plural(out.blocked, "purchase")} didn't attach: that account already has a refunded or removed enrolment for the same course.` : ""),
    });
    setConfirm(null);
    onDone();
  };

  return (
    <>
      <Dialog open={!!buyer} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change number</DialogTitle>
            <DialogDescription>
              {buyer?.full_name || "This buyer"}'s {plural(buyer?.purchase_count ?? 0, "TagMango purchase")} {(buyer?.purchase_count ?? 0) === 1 ? "is" : "are"} on{" "}
              <span className="font-mono">{buyer?.phone}</span>. Enter the number they sign in with: the purchases move to it and attach to their account now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {buyer?.email && (
              <p className="text-sm text-muted-foreground">Email on TagMango: <span className="text-foreground">{buyer.email}</span></p>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Correct number</label>
              <AdminPhoneInput value={phone} onChange={setPhone} onCountryChange={setCountry} disabled={saving} />
              {problem
                ? <p className="text-xs text-red-500 mt-1" aria-live="polite">{problem}</p>
                : <p className="text-xs text-muted-foreground mt-1">India is set; for a student abroad, pick their country first.</p>}
            </div>
            <Button
              onClick={() => save()}
              disabled={saving || !number || !!problem}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {saving ? "Saving…" : "Change number"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" /> That number has an account
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save(true); }} disabled={saving}>
              {saving ? "Saving…" : "Yes, attach them"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
