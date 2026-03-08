import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { LogIn } from "lucide-react";
import logo from "@/assets/logo.png";

const Auth = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
    <img src={logo} alt="Level Up" className="mb-6 h-14 w-14" />
    <h1 className="font-display text-2xl font-bold text-gradient mb-2">Level Up Learning</h1>
    <p className="mb-10 text-sm text-muted-foreground text-center max-w-xs">
      India's creative learning platform. Learn filmmaking, editing, content & more.
    </p>
    <div className="w-full max-w-sm space-y-3">
      <button className="w-full rounded-xl gradient-primary py-3 font-display font-semibold text-primary-foreground text-sm transition-transform active:scale-[0.98]">
        Sign Up
      </button>
      <button className="w-full rounded-xl border border-border bg-secondary py-3 font-display font-semibold text-secondary-foreground text-sm transition-transform active:scale-[0.98]">
        Log In
      </button>
    </div>
    <p className="mt-6 text-xs text-muted-foreground">
      By continuing, you agree to our Terms & Privacy Policy
    </p>
  </div>
);

export default Auth;
