import { useState } from "react";
import { useAppearance, type Accent, type ThemePref } from "@/lib/appearance";
import { areUiTicksEnabled, isSoundEnabled, playSound, setSoundEnabled, setUiTicksEnabled } from "@/lib/sound";
import { tapTick } from "@/lib/haptics";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";
import "./profile.css";

/**
 * Profile > Appearance under Stage (spec 12.1, profile row): the accent
 * (Ember or Mono), the theme once light mode ships, sound for the big moments
 * (on by default) and tap sounds (off by default). Each choice is stored on
 * this device and applies at once. Haptics follow the phone's own settings.
 */

const ACCENTS: { key: Accent; label: string }[] = [
  { key: "ember", label: "Ember" },
  { key: "mono", label: "Mono" },
];
const THEMES: { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "dark", label: "Dark" },
  { key: "light", label: "Light" },
];

function Switch({ label, detail, on, set }: { label: string; detail: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="pf-row">
      <span className="pf-row-t"><b>{label}</b><span>{detail}</span></span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`pf-switch${on ? " is-on" : ""}`} onClick={() => set(!on)}>
        <i />
      </button>
    </div>
  );
}

export default function StageAppearance() {
  const a = useAppearance();
  const [sound, setSound] = useState(isSoundEnabled);
  const [ticks, setTicks] = useState(areUiTicksEnabled);

  return (
    <section className="stage-ui pf-appearance" aria-labelledby="pf-ap-h">
      <h3 id="pf-ap-h" className="pf-h">Appearance</h3>
      <div className="pf-card">
        <div className="pf-row">
          <span className="pf-row-t"><b>Accent</b><span>The colour of buttons, progress and what's live.</span></span>
          <div className="ex-tabs pf-seg" role="radiogroup" aria-label="Accent">
            {ACCENTS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={a.accent === x.key}
                className={a.accent === x.key ? "is-on" : undefined}
                onClick={() => { if (a.accent !== x.key) { void tapTick(); a.setAccent(x.key); } }}
              >
                <i className={`pf-swatch pf-swatch--${x.key}`} aria-hidden />{x.label}
              </button>
            ))}
          </div>
        </div>
        {a.lightModeAvailable && (
          <div className="pf-row">
            <span className="pf-row-t"><b>Theme</b><span>System follows your phone or computer.</span></span>
            <div className="ex-tabs pf-seg" role="radiogroup" aria-label="Theme">
              {THEMES.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="radio"
                  aria-checked={a.theme === x.key}
                  className={a.theme === x.key ? "is-on" : undefined}
                  onClick={() => { if (a.theme !== x.key) { void tapTick(); a.setThemePref(x.key); } }}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Switch
          label="Sound"
          detail="A short sound when a class goes live, a payment goes through or you finish a lesson."
          on={sound}
          set={(v) => { setSoundEnabled(v); setSound(v); if (v) playSound("soft"); }}
        />
        <Switch
          label="Tap sounds"
          detail="A soft tick on every tap."
          on={ticks}
          set={(v) => { setUiTicksEnabled(v); setTicks(v); }}
        />
      </div>
    </section>
  );
}
