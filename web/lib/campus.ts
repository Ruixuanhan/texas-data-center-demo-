// Procedural asset architecture — every project becomes a small sculpted campus:
//   data center  → a row of long low server halls (count/size scale with MW)
//   gas plant    → turbine hall + exhaust stack + switchyard block
// Deterministic per slug (no jitter), generated in meters, scaled for the current zoom
// so the assets stay sculptural at state view and true-to-scale at street view.
import type { Project } from "./types";

export interface CampusBlock {
  polygon: [number, number][];
  height: number; // meters, pre-scale
  kind: "hall" | "stack" | "block";
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

const rect = (cx: number, cy: number, w: number, l: number, ang: number): [number, number][] => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return ([[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]] as [number, number][])
    .map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
};

/** metric offsets → lon/lat ring */
const toLL = (p: Project, ring: [number, number][], scale: number): [number, number][] => {
  const mLat = 110_570, mLon = 111_320 * Math.cos((p.lat! * Math.PI) / 180);
  return ring.map(([x, y]) => [p.lon! + (x * scale) / mLon, p.lat! + (y * scale) / mLat]);
};

export function buildCampus(p: Project, scale: number): CampusBlock[] {
  if (p.lat == null || p.lon == null) return [];
  const rnd = hash(p.slug);
  const ang = rnd() * Math.PI;
  const mw = p.capacity_mw ?? 20;
  const blocks: CampusBlock[] = [];

  if (p.project_type === "gas_to_power") {
    // turbine hall
    blocks.push({ polygon: toLL(p, rect(0, 0, 70, 150, ang), scale), height: 24, kind: "hall" });
    // exhaust stack — the vertical landmark
    blocks.push({ polygon: toLL(p, rect(65, 40, 26, 26, ang), scale), height: 85 + rnd() * 25, kind: "stack" });
    // switchyard block
    blocks.push({ polygon: toLL(p, rect(-70, -55, 60, 60, ang), scale), height: 8, kind: "block" });
  } else {
    // server halls: long, low, repeated — count grows with MW
    const halls = Math.max(1, Math.min(4, Math.round(Math.sqrt(mw) / 3.2)));
    const w = 95 + rnd() * 30, l = 210 + rnd() * 90, gap = 55;
    for (let i = 0; i < halls; i++) {
      const off = (i - (halls - 1) / 2) * (w + gap);
      blocks.push({ polygon: toLL(p, rect(off * Math.cos(ang + Math.PI / 2), off * Math.sin(ang + Math.PI / 2), w, l, ang), scale), height: 16 + rnd() * 7, kind: "hall" });
    }
    // substation block at the row's end
    blocks.push({ polygon: toLL(p, rect((l / 2 + 70) * Math.cos(ang), (l / 2 + 70) * Math.sin(ang), 55, 55, ang), scale), height: 7, kind: "block" });
  }
  return blocks;
}

/** big sculptural presence at state view, true scale on fly-in */
export const campusScale = (zoom: number) => Math.min(26, Math.max(1, 2 ** ((11.8 - zoom) * 0.82)));

/** construction reality → material state (color stays money-temperature) */
export const builtOpacity = (p: Project): number =>
  p.current_stage === "operational" || p.current_stage === "cod" ? 235
  : p.current_stage === "construction" ? 220
  : 140; // proposed / pre-FID — ghosted intent
