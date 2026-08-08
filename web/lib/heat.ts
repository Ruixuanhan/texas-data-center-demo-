// Investor heat: the single score that drives color, size, glow, and ranking.
// Origination logic — what Candid hunts: EARLY stage + REAL size + FRESH activity.
import type { Project, Stage } from "./types";

const STAGE_EARLINESS: Record<Stage, number> = {
  concept: 1.0, fel1: 0.95, fel2: 0.9, feed: 0.8,
  ia: 0.6, fid: 0.5, construction: 0.3,
  cod: 0.12, operational: 0.1, canceled: 0, unknown: 0.35,
};

export function heatScore(p: Project, now = Date.now()): number {
  const stage = STAGE_EARLINESS[p.current_stage] ?? 0.3;
  const mw = Math.min(1, Math.log10(Math.max(p.capacity_mw ?? 5, 1)) / Math.log10(300)); // 300MW ≈ 1.0
  const days = p.last_activity ? Math.max(0, (now - new Date(p.last_activity).getTime()) / 86400_000) : 60;
  const recency = Math.exp(-days / 10); // ~10-day half-life-ish decay
  return +(0.5 * stage + 0.28 * recency + 0.22 * mw).toFixed(3);
}

// Cold steel → petrol → ember → white-hot. Color = money temperature, nothing else.
const RAMP: [number, [number, number, number]][] = [
  [0.0, [56, 72, 92]],
  [0.35, [52, 108, 122]],
  [0.55, [222, 168, 62]],
  [0.75, [255, 137, 84]],
  [0.9, [255, 216, 168]],
  [1.0, [255, 247, 234]],
];

export function heatColor(h: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, h));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const heatHex = (h: number) =>
  `#${heatColor(h).map((c) => c.toString(16).padStart(2, "0")).join("")}`;

export function whyItMatters(p: Project, h: number): string {
  const bits: string[] = [];
  if ((STAGE_EARLINESS[p.current_stage] ?? 0) >= 0.8) bits.push("pre-FEED window — earliest entry point");
  else if ((STAGE_EARLINESS[p.current_stage] ?? 0) >= 0.5) bits.push("committed capital, delivery phase ahead");
  if ((p.capacity_mw ?? 0) >= 50) bits.push(`${p.capacity_mw} MW of load`);
  const days = p.last_activity ? Math.round((Date.now() - new Date(p.last_activity).getTime()) / 86400_000) : null;
  if (days != null && days <= 3) bits.push("filings moving this week");
  return bits.length ? bits.join(" · ") : "monitoring — no active origination signal";
}
