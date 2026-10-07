/**
 * LUCA's sound engine — Web Audio, no audio files.
 *
 * The sonic logo is the logo's own rising line, played: the four nodes above
 * "Up" sit low, high, middle, highest → E, B, G#, E (octave). Browsers only
 * allow audio after a user gesture, so nothing plays until the first tap, and
 * everything respects the learner's Sound setting (persisted per device).
 */
type ToneOpts = {
  a?: number; d?: number; r?: number; g?: number; s?: number; type?: OscillatorType;
  glide?: number; detune?: number; cutoff?: number; sweep?: number; q?: number; wet?: number;
};
type NoiseOpts = { filter?: BiquadFilterType; q?: number; freq?: number; sweep?: number; dur?: number; g?: number; a?: number; wet?: number };

const NOTES = [329.63, 493.88, 415.3, 659.25];
const TIMING = [0, 0.2, 0.4, 0.62];
const KEY = "luca.sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let verb: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

function impulse(sec: number, decay: number): AudioBuffer {
  const c = ctx as AudioContext;
  const rate = c.sampleRate, len = Math.floor(rate * sec), buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.75;
    master.connect(comp); comp.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(2.6, 2.4);
    const vg = ctx.createGain(); vg.gain.value = 0.32;
    verb.connect(vg); vg.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}
const ready = () => enabled && !!ctx && ctx.state === "running";

function tone(freq: number, t: number, o: ToneOpts = {}) {
  const c = ctx as AudioContext;
  const a = o.a ?? 0.01, d = o.d ?? 0.2, r = o.r ?? 0.4, peak = o.g ?? 0.2;
  const sus = Math.max(peak * (o.s ?? 0.3), 0.0001);
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + a + d);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(sus, t + a + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  let node: AudioNode = osc;
  if (o.cutoff) {
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.cutoff, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + a + d);
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(master as GainNode);
  if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(verb as ConvolverNode); }
  osc.start(t); osc.stop(t + a + d + r + 0.05);
}

function noise(t: number, o: NoiseOpts = {}) {
  const c = ctx as AudioContext;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = o.filter ?? "bandpass"; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq ?? 2000, t);
  const dur = o.dur ?? 0.08;
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.g ?? 0.05, t + (o.a ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master as GainNode);
  if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(verb as ConvolverNode); }
  src.start(t); src.stop(t + dur + 0.05);
}

function logoNote(i: number, t: number) {
  const f = NOTES[i], last = i === 3;
  tone(f, t, { type: "triangle", a: 0.03, d: 0.35, s: 0.35, r: last ? 2.2 : 1.3, g: 0.15, cutoff: 2600, wet: 0.7 });
  tone(f * 2, t + 0.01, { type: "sine", a: 0.02, d: 0.2, s: 0.2, r: last ? 1.6 : 0.8, g: 0.035, wet: 0.8 });
  if (last) {
    tone(82.41, t - 0.05, { type: "sine", a: 0.25, d: 0.6, s: 0.6, r: 1.6, g: 0.16 });
    tone(f * 1.5, t + 0.04, { type: "sine", a: 0.08, d: 0.4, s: 0.4, r: 1.8, g: 0.04, wet: 0.9 });
  }
}

export type SoundName = "tap" | "key" | "open" | "close" | "toggle" | "success" | "error" | "live" | "complete" | "soft";

export const sound = {
  unlock() { ensure(); },
  enabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
    if (on) ensure();
  },
  running: () => !!ctx && ctx.state === "running",
  buzz(pattern: number | number[]) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
  },
  node(i: number) { if (ready()) logoNote(i, (ctx as AudioContext).currentTime + 0.005); },
  nodes(stepMs = 160, startMs = 120) { [0, 1, 2, 3].forEach((i) => setTimeout(() => sound.node(i), startMs + i * stepMs)); },
  sonicLogo() {
    if (!ready()) return;
    const t0 = (ctx as AudioContext).currentTime + 0.03;
    noise(t0 - 0.02, { freq: 700, sweep: 2400, q: 0.6, dur: 0.7, a: 0.3, g: 0.02, wet: 0.6 });
    TIMING.forEach((dt, i) => logoNote(i, t0 + dt));
  },
  play(name: SoundName) {
    if (!ready()) return;
    const t = (ctx as AudioContext).currentTime + 0.005;
    switch (name) {
      case "tap": tone(560, t, { a: 0.002, d: 0.03, s: 0.01, r: 0.04, g: 0.05 }); break;
      case "key": tone(1150 + Math.random() * 120, t, { a: 0.002, d: 0.025, s: 0.01, r: 0.03, g: 0.03 }); break;
      case "open": noise(t, { freq: 300, sweep: 1800, q: 0.7, dur: 0.26, a: 0.08, g: 0.022 }); break;
      case "close": noise(t, { freq: 1600, sweep: 300, q: 0.7, dur: 0.2, a: 0.04, g: 0.016 }); break;
      case "toggle": tone(640, t, { a: 0.002, d: 0.03, s: 0.01, r: 0.03, g: 0.045 }); break;
      case "success":
        tone(659.25, t, { type: "triangle", a: 0.005, d: 0.12, s: 0.3, r: 0.6, g: 0.09, wet: 0.4 });
        tone(987.77, t + 0.11, { type: "triangle", a: 0.005, d: 0.14, s: 0.3, r: 0.9, g: 0.09, wet: 0.5 });
        break;
      case "error":
        tone(233, t, { type: "triangle", a: 0.005, d: 0.08, s: 0.2, r: 0.12, g: 0.1 });
        tone(196, t + 0.12, { type: "triangle", a: 0.005, d: 0.1, s: 0.2, r: 0.18, g: 0.1 });
        break;
      case "live":
        tone(880, t, { a: 0.004, d: 0.08, s: 0.2, r: 0.5, g: 0.08, wet: 0.4 });
        tone(1318.5, t + 0.14, { a: 0.004, d: 0.1, s: 0.2, r: 0.7, g: 0.07, wet: 0.5 });
        break;
      case "complete":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          tone(f, t + i * 0.075, { type: "triangle", a: 0.004, d: 0.1, s: 0.25, r: 0.6, g: 0.07, wet: 0.45 }));
        break;
      case "soft": tone(NOTES[3], t, { a: 0.02, d: 0.2, s: 0.2, r: 0.8, g: 0.05, wet: 0.6 }); break;
    }
  },
};
