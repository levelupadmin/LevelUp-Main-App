// Global, user-invisible safety ceiling (NOT a per-user quota — founder rule).
// A single platform-wide daily processed-count cap. At ~100 users (<1 capture/
// week each) this never trips; it only bounds a runaway/abuse spike so our Apify
// + Whisper spend can't blow up. Tune via STUDIO_DAILY_CAP.
import { sb } from "./supa.mjs";

export async function underDailyCeiling() {
  const CAP = Number(process.env.STUDIO_DAILY_CAP || 2000);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await sb(
    `cb_reels?processed_at=gte.${dayStart.toISOString()}&select=id&limit=${CAP + 1}`
  );
  return rows.length <= CAP;
}
