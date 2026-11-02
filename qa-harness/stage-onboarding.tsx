// QA HARNESS — NOT shipped. Mounts the REAL Stage onboarding view
// (src/components/stage/onboarding/StageOnboarding.tsx) so both steps can be
// checked without a brand-new signed-in account. Onboarding.tsx owns the
// data and rules; this only feeds the view its props.
//   ?step=profile   name and email (phone-first accounts)   (default)
//   ?step=crafts    what do you want to make
import { useState } from "react";
import { createRoot } from "react-dom/client";
import StageOnboarding from "@/components/stage/onboarding/StageOnboarding";
import "@/index.css";
import "@/styles/stage-fonts.css";
import "@/styles/stage.css";

function Harness() {
  const [step, setStep] = useState<"profile" | "crafts">(new URLSearchParams(location.search).get("step") === "crafts" ? "crafts" : "profile");
  const [fullName, setFullName] = useState(step === "crafts" ? "Divya Menon" : "");
  const [email, setEmail] = useState("");
  const [crafts, setCrafts] = useState<string[]>([]);
  return (
    <StageOnboarding
      step={step}
      stepNum={step === "profile" ? 1 : 2}
      totalSteps={2}
      saving={false}
      fullName={fullName}
      setFullName={setFullName}
      email={email}
      setEmail={setEmail}
      profileValid={fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
      onProfileNext={(e) => { e.preventDefault(); setStep("crafts"); }}
      crafts={crafts}
      toggleCraft={(s) => setCrafts((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]))}
      onFinish={() => alert(`saved: ${crafts.join(", ") || "(skipped)"}`)}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
