/** The test people in ops/luca/e2e/fixtures.sql, and who the preview is signed in as. */
export const PEOPLE = [
  { id: "00000000-0000-0000-0000-0000000000b1", name: "Lena One", note: "learner, paid in full", role: "student", email: "lena.one@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000b2", name: "Lou Two", note: "learner, enrolled", role: "student", email: "lou.two@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000b3", name: "Leo Three", note: "learner, Track B", role: "student", email: "leo.three@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000d1", name: "Kim Locked", note: "balance overdue", role: "student", email: "kim.locked@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000e1", name: "Pia Applicant", note: "not applied yet", role: "student", email: "pia.applies@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000f1", name: "Oz Outsider", note: "no access", role: "student", email: "oz.outside@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000c1", name: "Mo Mentor", note: "mentor of luca-c3", role: "instructor", email: "mo.mentor@e2e.test" },
  { id: "00000000-0000-0000-0000-0000000000a1", name: "Ada Admin", note: "admin", role: "admin", email: "ada.admin@e2e.test" },
] as const;

export const LIVE = import.meta.env.VITE_LUCA_LIVE === "1";
const KEY = "luca.preview.uid";

export function whoId(): string {
  try { return localStorage.getItem(KEY) || (LIVE ? PEOPLE[0].id : "00000000-0000-0000-0000-00000000000a"); } catch { return PEOPLE[0].id; }
}
export function setWho(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
export function who() {
  const id = whoId();
  return PEOPLE.find((p) => p.id === id) ?? { id, name: "Diya Sharma", note: "demo staff", role: "admin", email: "staff@example.com" };
}
