// LevelUp sound engine. Web Audio, synthesised, no audio files, ~0 KB of assets.
// Target path: src/lib/sound.ts
//
// The sonic logo is the logo's own line, played. The four nodes of the rising
// line above "Up" sit low, high, middle, highest. Mapped to pitch that is
// E4, B4, G#4, E5. Warm triangle tones with a little room reverb.
//
// Doctrine (spec section 9):
//   - Sound marks MOMENTS, not taps. Moment sounds are on by default; UI ticks
//     are off by default and only exist for people who turn them on.
//   - Nothing plays before the first user gesture (browser + WebView rule).
//   - Nothing plays while a video is playing (suppressSounds()).
//   - One Sound switch in Profile turns all of it off.
//   - Only wired up when Stage is on: call installAudioUnlock() only under the
//     BRAND_STAGE flag, so the flag-off app is untouched.

export type MomentSound = "success" | "error" | "live" | "complete" | "soft";
export type UiSound = "tap" | "key" | "toggle" | "open" | "close";
export type SoundName = MomentSound | UiSound;

const MOMENTS: ReadonlySet<SoundName> = new Set<SoundName>(["success", "error", "live", "complete", "soft"]);

// E4 B4 G#4 E5: the logo's line.
export const LOGO_NOTES = [329.63, 493.88, 415.3, 659.25] as const;
// Offsets (s) of the four notes in the full sonic logo. Mirrors signInMoment.sonicLogo.
export const SONIC_LOGO_OFFSETS = [0, 0.2, 0.4, 0.62] as const;

const PREF_SOUND = "lu.sound"; // "on" | "off"  (default on)
const PREF_TICKS = "lu.sound.ticks"; // "on" | "off" (default off)

type ToneOpts = {
  type?: OscillatorType;
  a?: number; // attack (s)
  d?: number; // decay (s)
  s?: number; // sustain as a fraction of peak
  r?: number; // release (s)
  g?: number; // peak gain
  cutoff?: number; // low-pass cutoff (Hz)
  wet?: number; // reverb send
};
type NoiseOpts = { freq?: number; sweep?: number; q?: number; dur?: number; a?: number; g?: number; wet?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let verb: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let suppressors = 0; // how many players currently need silence

const readPref = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === "on";
  } catch {
    return fallback;
  }
};
const writePref = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* storage unavailable: the in-memory default still applies */
  }
};

let soundOn = readPref(PREF_SOUND, true);
let ticksOn = readPref(PREF_TICKS, false);

export const isSoundEnabled = () => soundOn;
export const areUiTicksEnabled = () => ticksOn;
export function setSoundEnabled(on: boolean) {
  soundOn = on;
  writePref(PREF_SOUND, on);
}
export function setUiTicksEnabled(on: boolean) {
  ticksOn = on;
  writePref(PREF_TICKS, on);
}
/**
 * Silence brand sounds while a video or recording plays. Returns a release
 * function. Counted, so two players (a preview and the main player) can't
 * un-mute each other.
 *   useEffect(() => (playing ? suppressSounds() : undefined), [playing]);
 */
export function suppressSounds(): () => void {
  suppressors += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suppressors = Math.max(0, suppressors - 1);
  };
}

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    // iOS 17+ WebKit: "ambient" mixes with other apps' audio and respects the
    // silent switch. Feature-detected; a no-op everywhere else.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "ambient";
      } catch {
        /* older WebKit */
      }
    }
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(comp);
    comp.connect(ctx.destination);
    verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.6, 2.4);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.32;
    verb.connect(verbGain);
    verbGain.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Gestures that count as "user activation" for audio in WebKit and Chromium.
// pointerdown/touchstart do NOT count for touch; the end of the tap does.
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;
let unlockInstalled = false;

/**
 * Install once at app start (main.tsx, only when Stage is on). Every tap tries
 * to start or resume audio; the listeners remove themselves only once audio is
 * actually running. Also resumes after the app comes back from background or
 * an iOS audio interruption (a call, Siri), which suspends the context.
 */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const tryUnlock = () => {
    const c = ensure();
    if (c && c.state === "running") UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, tryUnlock, true));
  };
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, tryUnlock, true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !ctx) return;
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => {});
      // If resume needs a gesture again, the next tap will do it.
      UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, tryUnlock, true));
    }
  });
}

const ready = (): boolean => {
  if (!soundOn || suppressors > 0 || !ctx) return false;
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {}); // e.g. "interrupted" on iOS; plays next time if this works
    return false;
  }
  return true;
};

function tone(freq: number, t: number, o: ToneOpts = {}) {
  if (!ctx || !master || !verb) return;
  const a = o.a ?? 0.01;
  const d = o.d ?? 0.2;
  const r = o.r ?? 0.4;
  const peak = o.g ?? 0.2;
  const sus = Math.max(peak * (o.s ?? 0.3), 0.0001);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(sus, t + a + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  let node: AudioNode = osc;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(o.cutoff, t);
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  if (o.wet) {
    const w = ctx.createGain();
    w.gain.value = o.wet;
    g.connect(w);
    w.connect(verb);
  }
  osc.start(t);
  osc.stop(t + a + d + r + 0.05);
}

function noise(t: number, o: NoiseOpts = {}) {
  if (!ctx || !master || !verb) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const dur = o.dur ?? 0.08;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq ?? 2000, t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.g ?? 0.05, t + (o.a ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  if (o.wet) {
    const w = ctx.createGain();
    w.gain.value = o.wet;
    g.connect(w);
    w.connect(verb);
  }
  src.start(t);
  src.stop(t + dur + 0.05);
}

function logoNote(i: number, t: number) {
  const f = LOGO_NOTES[i];
  const last = i === 3;
  tone(f, t, { type: "triangle", a: 0.03, d: 0.35, s: 0.35, r: last ? 2.2 : 1.3, g: 0.15, cutoff: 2600, wet: 0.7 });
  tone(f * 2, t + 0.01, { type: "sine", a: 0.02, d: 0.2, s: 0.2, r: last ? 1.6 : 0.8, g: 0.035, wet: 0.8 });
  if (last) {
    tone(82.41, t - 0.05, { type: "sine", a: 0.25, d: 0.6, s: 0.6, r: 1.6, g: 0.16 }); // low E under the last note
    tone(f * 1.5, t + 0.04, { type: "sine", a: 0.08, d: 0.4, s: 0.4, r: 1.8, g: 0.04, wet: 0.9 });
  }
}

/** One node of the logo. The first-launch intro calls this as each node draws. */
export function playLogoNote(i: 0 | 1 | 2 | 3) {
  if (!ready() || !ctx) return;
  logoNote(i, ctx.currentTime + 0.005);
}

/** The whole sonic logo. The sign-in moment plays this. ~2.8s including tail. */
export function playSonicLogo() {
  if (!ready() || !ctx) return;
  const t0 = ctx.currentTime + 0.03;
  noise(t0 - 0.02, { freq: 700, sweep: 2400, q: 0.6, dur: 0.7, a: 0.3, g: 0.02, wet: 0.6 }); // a soft breath in
  SONIC_LOGO_OFFSETS.forEach((dt, i) => logoNote(i, t0 + dt));
}

export function playSound(name: SoundName) {
  if (!ready() || !ctx) return;
  if (!MOMENTS.has(name) && !ticksOn) return;
  const t = ctx.currentTime + 0.005;
  switch (name) {
    case "success": // payment done, application sent, assignment submitted
      tone(659.25, t, { type: "triangle", a: 0.005, d: 0.12, s: 0.3, r: 0.6, g: 0.09, wet: 0.4 });
      tone(987.77, t + 0.11, { type: "triangle", a: 0.005, d: 0.14, s: 0.3, r: 0.9, g: 0.09, wet: 0.5 });
      break;
    case "error": // payment failed, wrong OTP
      tone(233, t, { type: "triangle", a: 0.005, d: 0.08, s: 0.2, r: 0.12, g: 0.1 });
      tone(196, t + 0.12, { type: "triangle", a: 0.005, d: 0.1, s: 0.2, r: 0.18, g: 0.1 });
      break;
    case "live": // a class you are enrolled in just went live, app in the foreground
      tone(880, t, { type: "sine", a: 0.004, d: 0.08, s: 0.2, r: 0.5, g: 0.08, wet: 0.4 });
      tone(1318.5, t + 0.14, { type: "sine", a: 0.004, d: 0.1, s: 0.2, r: 0.7, g: 0.07, wet: 0.5 });
      break;
    case "complete": // lesson or course complete (after the video has stopped)
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, t + i * 0.075, { type: "triangle", a: 0.004, d: 0.1, s: 0.25, r: 0.6, g: 0.07, wet: 0.45 }),
      );
      break;
    case "soft": // gentle confirmation: saved, reminder set
      tone(LOGO_NOTES[3], t, { type: "sine", a: 0.02, d: 0.2, s: 0.2, r: 0.8, g: 0.05, wet: 0.6 });
      break;
    case "tap":
      tone(560, t, { type: "sine", a: 0.002, d: 0.03, s: 0.01, r: 0.04, g: 0.05 });
      break;
    case "key": // OTP digit
      tone(1150 + Math.random() * 120, t, { type: "sine", a: 0.002, d: 0.025, s: 0.01, r: 0.03, g: 0.03 });
      break;
    case "toggle":
      tone(640, t, { type: "sine", a: 0.002, d: 0.03, s: 0.01, r: 0.03, g: 0.045 });
      break;
    case "open": // sheet up
      noise(t, { freq: 300, sweep: 1800, q: 0.7, dur: 0.26, a: 0.08, g: 0.022 });
      break;
    case "close": // sheet down
      noise(t, { freq: 1600, sweep: 300, q: 0.7, dur: 0.2, a: 0.04, g: 0.016 });
      break;
  }
}
