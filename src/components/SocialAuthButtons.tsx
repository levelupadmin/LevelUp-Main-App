import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.4 34.9 26.8 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.3 5.3C41.9 34.7 44 29.7 44 24c0-1.3-.1-2.3-.4-3.5z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

interface Props {
  /** Where to send the user after the provider round-trip completes. */
  redirectTo?: string;
}

const SocialAuthButtons = ({ redirectTo = "/home" }: Props) => {
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);

  const signIn = async (provider: "google" | "apple") => {
    setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${redirectTo}`,
      },
    });
    if (error) {
      toast.error(`${provider === "google" ? "Google" : "Apple"} sign-in unavailable`, {
        description: error.message.includes("Unsupported provider")
          ? "Provider not yet configured."
          : error.message,
      });
      setLoading(null);
    }
    // On success, the browser redirects — no need to clear loading.
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={loading !== null}
        className="w-full h-11 rounded-md border border-border bg-surface hover:bg-surface-2 transition-colors flex items-center justify-center gap-2.5 text-sm font-medium disabled:opacity-50"
      >
        {loading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => signIn("apple")}
        disabled={loading !== null}
        className="w-full h-11 rounded-md border border-border bg-surface hover:bg-surface-2 transition-colors flex items-center justify-center gap-2.5 text-sm font-medium disabled:opacity-50"
      >
        {loading === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon />}
        Continue with Apple
      </button>
    </div>
  );
};

export default SocialAuthButtons;
