import * as T from "./time";
import type { Program } from "./types";

export const inr = (n: number | string | null | undefined): string => {
  const v = Number(n ?? 0);
  return "₹" + Math.round(v).toLocaleString("en-IN");
};
export const num = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString("en-IN");
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
export const r10 = (n: number) => Math.round(n / 10) * 10;

/** "Aarav, Meher and Riya" */
export function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * Fill {placeholders} in admin-authored copy from the program's real facts.
 * Unknown placeholders are left as-is so a typo is visible, not silently blank.
 */
export function fill(text: string | null | undefined, p: Program, extra: Record<string, string | number> = {}): string {
  if (!text) return "";
  const pr = p.pricing;
  const start = p.starts_at ? new Date(p.starts_at) : null;
  const demo = p.demo_day_at ? new Date(p.demo_day_at) : null;
  const sprintStart = p.sprint?.starts_on ? T.dateOnly(p.sprint.starts_on) : null;
  const sprintEnd = sprintStart ? T.add(sprintStart, (p.sprint.days || 21) - 1) : null;
  const vars: Record<string, string | number> = {
    cohort: p.cohort_label || p.name,
    program: p.name,
    short: p.short_name || p.name,
    app_fee: inr(pr?.app_fee),
    deposit: inr(pr?.deposit),
    balance: inr(Math.max(0, (pr?.price ?? 0) - (pr?.deposit ?? 0) - (pr?.app_fee ?? 0))),
    price: inr(pr?.price),
    seats: p.seats ?? "",
    start_day: start ? T.day(start) : "soon",
    start_dm: start ? T.dm(start) : "",
    demo_day: demo ? T.day(demo) : "Demo Day",
    demo_dm: demo ? T.dm(demo) : "",
    days_to_start: start ? Math.max(0, T.diffDays(start, T.now())) : "",
    sprint_start: sprintStart ? T.day(sprintStart) : "",
    sprint_end: sprintEnd ? T.day(sprintEnd) : "",
    ...extra,
  };
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * What is left after the application fee and the deposit. This matches
 * create-razorpay-order's balance stage exactly (price − app fee − deposit),
 * so the number on screen is the number Razorpay will ask for.
 */
export const balanceOf = (p: Program) =>
  Math.max(0, (p.pricing?.price ?? 0) - (p.pricing?.deposit ?? 0) - (p.pricing?.app_fee ?? 0));
