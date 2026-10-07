import { useCallback, useEffect, useState } from "react";

/** Ember or Mono, dark or light: a per-device preference, nothing more. */
export type Accent = "ember" | "mono";
export type Theme = "dark" | "light";

const read = <T extends string>(k: string, ok: readonly T[], d: T): T => {
  try {
    const v = localStorage.getItem(k) as T | null;
    return v && ok.includes(v) ? v : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
};

const listeners = new Set<() => void>();
let accent: Accent = read("luca.accent", ["ember", "mono"] as const, "ember");
let theme: Theme = read("luca.theme", ["dark", "light"] as const, "dark");

export function useLook() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  const setAccent = useCallback((a: Accent) => { accent = a; write("luca.accent", a); listeners.forEach((l) => l()); }, []);
  const setTheme = useCallback((t: Theme) => { theme = t; write("luca.theme", t); listeners.forEach((l) => l()); }, []);
  return { accent, theme, setAccent, setTheme };
}
