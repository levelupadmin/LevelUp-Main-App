import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

/**
 * Optional "add your email" ask, for an account made by phone with no real
 * email yet (its email is the <digits>@phone.leveluplearning.in placeholder).
 * Saving goes through set_onboarding_profile, which keeps it on the profile
 * only: it becomes a sign-in once the app can confirm it with a code.
 * Skippable; a skip is remembered on this device.
 */
const PLACEHOLDER_DOMAIN = "@phone.leveluplearning.in";
const SKIP_KEY = "levelup:add-email-skipped";

export default function AddEmailPrompt() {
  const { user } = useAuth();
  const [needed, setNeeded] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(SKIP_KEY) === user.id) return;
    } catch {
      /* storage blocked: just ask */
    }
    let alive = true;
    supabase
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const current = (data.email ?? "").trim();
        setName(data.full_name ?? "");
        setNeeded(!current || current.endsWith(PLACEHOLDER_DOMAIN));
      });
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user || !needed) return null;

  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY, user.id);
    } catch {
      /* nothing to remember */
    }
    setNeeded(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("That doesn't look like an email address.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.rpc as CallableFunction)("set_onboarding_profile", {
      p_full_name: name.trim().length >= 2 ? name.trim() : "LevelUp Student",
      p_email: email.trim(),
    }) as { error: { message?: string } | null };
    setSaving(false);
    if (error) {
      toast.error(error.message?.includes("email_taken")
        ? "That email is already used by another account."
        : "Couldn't save your email. Try again from your profile.");
      return;
    }
    toast.success("Email added.");
    setNeeded(false);
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-md rounded-2xl bg-surface-2 p-5 space-y-3 text-left">
      <div className="space-y-1">
        <p className="font-medium text-foreground">Add your email (optional)</p>
        <p className="text-sm text-muted-foreground">For receipts and class links.</p>
      </div>
      <label htmlFor="add-email" className="sr-only">Email address</label>
      <Input
        id="add-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-11"
      />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={saving}>{saving ? "Saving…" : "Save email"}</Button>
        <Button type="button" variant="ghost" className="h-11" onClick={skip}>Not now</Button>
      </div>
    </form>
  );
}
