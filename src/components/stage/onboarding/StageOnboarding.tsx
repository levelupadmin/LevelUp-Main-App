import type { FormEvent } from "react";
import { Check } from "lucide-react";
import { LevelUpMark } from "@/components/brand/LevelUpMark";
import { LevelUpLoader } from "@/components/brand/LevelUpLoader";
import { CRAFT_OPTIONS } from "@/components/auth/CraftPicker";
import { hapticSelection } from "@/lib/haptics";
import "@/styles/stage-ui.css";
import "./onboarding.css";

/**
 * Onboarding under Stage (spec 12.1, round-4 mockup's onboard view): the
 * one-time screen after a first sign-in. Step 1 (phone-first accounts only):
 * name and email. Step 2: what they want to make, as picture tiles of
 * LevelUp's own photos (selected = a brand-line ring and a slight brighten),
 * with one Ember button at the bottom. Onboarding.tsx keeps every rule (the
 * profile RPC, the ask-once crafts marker, Skip) and hands this view the
 * state.
 */

/** LevelUp's own photos (public/brand/wall), never stock, one per craft slug. */
const CRAFT_PHOTO: Record<string, string> = {
  filmmaking: "/brand/wall/m-lokesh.jpg",
  editing: "/brand/wall/m-anthony.jpg",
  photography: "/brand/wall/m-venket.jpg",
  music: "/brand/wall/m-ravi.jpg",
  writing: "/brand/wall/w-forge-writing-4.jpg",
  vfx: "/brand/wall/f-editing.jpg",
};

interface Props {
  step: "profile" | "crafts";
  stepNum: number;
  totalSteps: number;
  saving: boolean;
  fullName: string;
  setFullName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  profileValid: boolean;
  onProfileNext: (e: FormEvent) => void;
  crafts: string[];
  toggleCraft: (slug: string) => void;
  onFinish: () => void;
}

export default function StageOnboarding(p: Props) {
  const first = p.fullName.trim().split(/\s+/)[0];
  return (
    <div className="stage-ui ob">
      <header className="ob-top">
        <LevelUpMark showSub={false} className="!h-[26px] w-auto ob-logo" lineClassName="text-brand-text" />
        {p.totalSteps > 1 && (
          <span className="ob-dots" aria-label={`Step ${p.stepNum} of ${p.totalSteps}`}>
            {Array.from({ length: p.totalSteps }, (_, i) => <i key={i} className={i < p.stepNum ? "is-on" : undefined} />)}
          </span>
        )}
        {p.step === "crafts" ? (
          <button type="button" className="ob-skip" onClick={p.onFinish} disabled={p.saving}>Skip</button>
        ) : <span />}
      </header>

      <main className="ob-main" key={p.step}>
        {p.step === "profile" ? (
          <form className="ob-form" onSubmit={p.onProfileNext}>
            <span className="eyebrow">Step {p.stepNum} of {p.totalSteps}</span>
            <h1 className="ob-h">What should we call you?</h1>
            <p className="ob-s">Your name goes on your certificates. Receipts and class links go to your email.</p>
            <label className="ob-field">
              <span className="ob-label">Full name</span>
              <input
                className="ob-input"
                type="text"
                placeholder="Your full name"
                value={p.fullName}
                onChange={(e) => p.setFullName(e.target.value)}
                autoComplete="name"
                autoFocus
                required
              />
            </label>
            <label className="ob-field">
              <span className="ob-label">Email</span>
              <input
                className="ob-input"
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                value={p.email}
                onChange={(e) => p.setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className={`btn btn--block ob-cta${p.saving ? " is-busy" : ""}`} disabled={p.saving || !p.profileValid}>
              {p.saving ? <><LevelUpLoader size={28} label="Saving" />Saving</> : "Continue"}
            </button>
          </form>
        ) : (
          <div className="ob-form ob-form--crafts">
            <span className="eyebrow">Step {p.stepNum} of {p.totalSteps}</span>
            <h1 className="ob-h">{first ? `What do you want to make, ${first}?` : "What do you want to make?"}</h1>
            <p className="ob-s">Pick as many as you like. This only shapes what you see first, and you can change it later.</p>
            <div className="ob-crafts" role="group" aria-label="Crafts">
              {CRAFT_OPTIONS.map((c) => {
                const on = p.crafts.includes(c.slug);
                return (
                  <button
                    key={c.slug}
                    type="button"
                    className={`ob-craft${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => { void hapticSelection(); p.toggleCraft(c.slug); }}
                  >
                    <img src={CRAFT_PHOTO[c.slug] ?? c.image} alt="" loading="lazy" decoding="async" />
                    <span className="ob-craft-t">
                      <b>{c.label}</b>
                      <span>{c.blurb}</span>
                    </span>
                    <span className="ob-craft-ck" aria-hidden><Check className="ic" strokeWidth={3} /></span>
                  </button>
                );
              })}
            </div>
            <div className="ob-foot">
              <button type="button" className={`btn btn--block${p.saving ? " is-busy" : ""}`} onClick={p.onFinish} disabled={p.saving || p.crafts.length === 0}>
                {p.saving ? <><LevelUpLoader size={28} label="Saving" />Saving</> : p.crafts.length ? "Continue" : "Pick at least one"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
