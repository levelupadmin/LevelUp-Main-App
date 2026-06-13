// GET /api/cron — Vercel Cron hits this every minute and drains the pending
// queue, so reels captured while the user is away get transcribed on their own.
// Protected by CRON_SECRET (Vercel sends it as `Authorization: Bearer <secret>`).
import { drainPending } from "../lib/worker.mjs";

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers["authorization"] !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const out = await drainPending(Number(process.env.STUDIO_DRAIN_LIMIT || 5));
    return res.status(200).json({ drained: out.length, out });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
