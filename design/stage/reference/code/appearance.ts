// Appearance: brand on/off, light/dark, Ember/Mono. One place sets the three
// attributes on <html> that tokens/stage.css reads.
// Target path: src/lib/appearance.ts
//
//   <html data-brand="stage" data-theme="dark|light" data-accent="ember|mono">
//
// Call initAppearance() in src/main.tsx BEFORE the first React render, so the
// first painted frame is already on-brand (the boot splash covers until then).
// The Profile > Appearance section uses useAppearance().

import * as React from "react";
import { flag } from "@/lib/flags";

export type ThemePref = "system" | "dark" | "light";
export type Accent = "ember" | "mono";
export type ResolvedTheme = "dark" | "light";

// Flags, resolved the repo's way (src/lib/flags.ts): a localStorage override
// first (so you can preview Stage on the live site by setting
// localStorage["VITE_BRAND_STAGE"] = "on"), then the env var, then the
// registry default. REGISTER BOTH in flags.ts with default false.
// Read once at module load, so every component sees one consistent answer
// for the whole session and flag-off rendering is identical to today.
export const BRAND_STAGE = "VITE_BRAND_STAGE";
export const BRAND_LIGHT = "VITE_BRAND_LIGHT";
export const STAGE_ENABLED = flag(BRAND_STAGE);
// Light mode ships in a later phase (spec section 13). Until then Stage is dark only.
export const LIGHT_MODE_ENABLED = STAGE_ENABLED && flag(BRAND_LIGHT);

// Page colours for <meta name="theme-color">. Hex on purpose: computed styles
// may not be ready yet (the app loads CSS without blocking, see
// build/non-blocking-css.ts), and the address bar should never flash.
const PAGE_BG: Record<ResolvedTheme, string> = { dark: "#0c0d0f", light: "#f3f4f6" };

const KEY_THEME = "lu.theme";
const KEY_ACCENT = "lu.accent";

type State = { theme: ThemePref; accent: Accent; resolved: ResolvedTheme };

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
};

const mql = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const resolve = (pref: ThemePref): ResolvedTheme => {
  if (!LIGHT_MODE_ENABLED) return "dark";
  if (pref === "system") return mql?.matches === false ? "light" : "dark";
  return pref;
};

let state: State = (() => {
  const theme = read<ThemePref>(KEY_THEME, ["system", "dark", "light"], "dark");
  const accent = read<Accent>(KEY_ACCENT, ["ember", "mono"], "ember");
  return { theme, accent, resolved: resolve(theme) };
})();
const listeners = new Set<() => void>();

// Keep the native status bar icons readable on the current background.
// Same bridge-proxy resolution as src/lib/haptics.ts: no bare-specifier import.
type StatusBarPlugin = { setStyle(o: { style: "DARK" | "LIGHT" }): Promise<void> };
const syncStatusBar = (resolved: ResolvedTheme) => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { StatusBar?: StatusBarPlugin } } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  // Capacitor's Style.Dark = light icons for dark backgrounds.
  void cap.Plugins?.StatusBar?.setStyle({ style: resolved === "dark" ? "DARK" : "LIGHT" }).catch(() => {});
};

function apply() {
  const root = document.documentElement;
  if (!STAGE_ENABLED) {
    root.removeAttribute("data-brand");
    return;
  }
  root.setAttribute("data-brand", "stage");
  root.setAttribute("data-theme", state.resolved);
  root.setAttribute("data-accent", state.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PAGE_BG[state.resolved]);
  syncStatusBar(state.resolved);
}

function commit(next: Partial<State>) {
  const theme = next.theme ?? state.theme;
  state = { theme, accent: next.accent ?? state.accent, resolved: resolve(theme) };
  apply();
  listeners.forEach((l) => l());
}

export function initAppearance() {
  apply();
  mql?.addEventListener?.("change", () => {
    if (state.theme === "system") commit({});
  });
}

export function setThemePref(theme: ThemePref) {
  write(KEY_THEME, theme);
  commit({ theme });
}

export function setAccent(accent: Accent) {
  write(KEY_ACCENT, accent);
  commit({ accent });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const snapshot = () => state;

/** For Profile > Appearance: current choices plus the setters. */
export function useAppearance() {
  const s = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...s, stage: STAGE_ENABLED, lightModeAvailable: LIGHT_MODE_ENABLED, setThemePref, setAccent };
}
