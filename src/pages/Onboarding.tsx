import { Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";

const interests = ["Filmmaking", "Editing", "Content Creation", "Cinematography", "Screenwriting", "Sound Design"];

const Onboarding = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-6">
    <div className="w-full max-w-md text-center">
      <img src={logo} alt="Level Up" className="mx-auto mb-6 h-12 w-12" />
      <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-secondary">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Level Up</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Tell us what you're interested in creating.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {interests.map((tag) => (
          <button
            key={tag}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
          >
            {tag}
          </button>
        ))}
      </div>
      <button className="mt-10 w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        Continue
      </button>
    </div>
  </div>
);

export default Onboarding;
