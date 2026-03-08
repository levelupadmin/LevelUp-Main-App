import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import { Check, Film, Scissors, Camera, Smartphone, Palette, Music, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const interestOptions = [
  { id: "filmmaking", label: "Filmmaking", icon: Film },
  { id: "editing", label: "Video Editing", icon: Scissors },
  { id: "cinematography", label: "Cinematography", icon: Camera },
  { id: "content", label: "Content Creation", icon: Smartphone },
  { id: "design", label: "Design", icon: Palette },
  { id: "music", label: "Music", icon: Music },
];

const experienceLevels = [
  { id: "beginner", label: "Beginner", desc: "Just starting out — eager to learn the basics" },
  { id: "intermediate", label: "Intermediate", desc: "Some experience — looking to level up my skills" },
  { id: "advanced", label: "Advanced", desc: "Experienced — want to master and mentor" },
];

const goalOptions = [
  { id: "learn", label: "Learn a new skill" },
  { id: "portfolio", label: "Build my portfolio" },
  { id: "collaborate", label: "Find collaborators or work" },
  { id: "explore", label: "Explore and discover" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { completeOnboarding, isAuthenticated, hasCompletedOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (hasCompletedOnboarding) return <Navigate to="/home" replace />;

  const toggleInterest = (id: string) =>
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const canNext = step === 0 ? interests.length > 0 : step === 1 ? !!experience : !!goal;

  const handleNext = async () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      setSaving(true);
      await completeOnboarding({ interests, experience, goal });
      toast({ title: "You're all set! Let's go 🚀" });
      navigate("/home", { replace: true });
    }
  };

  const skip = async () => {
    setSaving(true);
    await completeOnboarding({ interests: [], experience: "", goal: "" });
    navigate("/home", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <img src={logo} alt="Level Up" className="mx-auto mb-6 h-12 w-12" />

        {/* Progress dots */}
        <div className="mb-8 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-8 bg-highlight" : i < step ? "w-2 bg-highlight/60" : "w-2 bg-secondary"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Interests */}
        {step === 0 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">What excites you?</h1>
            <p className="text-sm text-muted-foreground mb-8">Pick as many as you like</p>
            <div className="grid grid-cols-2 gap-3">
              {interestOptions.map(({ id, label, icon: Icon }) => {
                const selected = interests.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleInterest(id)}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border p-5 text-sm font-medium transition-all ${
                      selected
                        ? "border-highlight bg-highlight/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-highlight/40"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-highlight">
                        <Check className="h-3 w-3 text-highlight-foreground" />
                      </span>
                    )}
                    <Icon className="h-6 w-6" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Experience */}
        {step === 1 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Where are you in your journey?</h1>
            <p className="text-sm text-muted-foreground mb-8">This helps us personalize your experience</p>
            <div className="space-y-3">
              {experienceLevels.map(({ id, label, desc }) => (
                <button
                  key={id}
                  onClick={() => setExperience(id)}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${
                    experience === id
                      ? "border-highlight bg-highlight/10"
                      : "border-border bg-card hover:border-highlight/40"
                  }`}
                >
                  <p className="font-semibold text-foreground">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Goal */}
        {step === 2 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">What's your main goal?</h1>
            <p className="text-sm text-muted-foreground mb-8">You can always change this later</p>
            <div className="space-y-3">
              {goalOptions.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setGoal(id)}
                  className={`w-full rounded-lg border p-4 text-left text-sm font-medium transition-all ${
                    goal === id
                      ? "border-highlight bg-highlight/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-highlight/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canNext || saving}
            className="flex-1 rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving..." : step === 2 ? "Get Started" : "Next"}
          </button>
        </div>

        <button onClick={skip} disabled={saving} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
