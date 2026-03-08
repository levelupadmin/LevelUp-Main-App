import { Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";

const Onboarding = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
    <img src={logo} alt="Level Up" className="mb-6 h-14 w-14" />
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
      <Sparkles className="h-8 w-8 text-primary" />
    </div>
    <h1 className="font-display text-2xl font-bold text-foreground mb-2">Welcome to Level Up</h1>
    <p className="max-w-xs text-sm text-muted-foreground mb-8">
      Let's personalize your experience. Tell us what you're interested in creating.
    </p>
    <div className="flex flex-wrap justify-center gap-2 max-w-sm">
      {["Filmmaking", "Editing", "Content Creation", "Cinematography", "Screenwriting", "Sound Design"].map((tag) => (
        <button
          key={tag}
          className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {tag}
        </button>
      ))}
    </div>
    <button className="mt-10 w-full max-w-xs rounded-xl gradient-primary py-3 font-display font-semibold text-primary-foreground text-sm">
      Continue
    </button>
  </div>
);

export default Onboarding;
