// Placeholder neutral-dark tokens — REPLACED by the winning direction's DESIGN.md values
// at the taste gate. Single TS source for values deck.gl needs as RGB arrays; the same
// values are exposed to CSS as custom properties in app/globals.css.
import type { Severity, Stage } from "./types";

export const STAGE_COLORS: Record<Stage, [number, number, number]> = {
  concept: [110, 168, 254],
  fel1: [92, 200, 226],
  fel2: [61, 218, 215],
  feed: [122, 226, 160],
  ia: [214, 222, 110],
  fid: [255, 180, 84],
  construction: [255, 137, 84],
  cod: [255, 255, 255],
  operational: [148, 163, 184],
  canceled: [71, 85, 105],
  unknown: [100, 116, 139],
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: "var(--signal-low)",
  notable: "var(--signal-notable)",
  major: "var(--signal-major)",
};

export const stageHex = (s: Stage) =>
  `#${STAGE_COLORS[s].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

// sRGB mirrors of the OKLCH deep scale for consumers that can't parse oklch()
// (MapLibre paint properties, GSAP color tweens). Source of truth: tokens/dataplanner.tokens.json.
// The la-phase-5 read: land is dark designed slate, water darker still, and the
// street/grid linework is BRIGHT — the drawing carries the map, not imagery.
export const WORLD = {
  water: "#16212d",
  land: "#232f3c",
  park: "#20302e",
  background: "#1b2733",
  roadMajor: "rgba(232,242,252,0.50)",
  roadMinor: "rgba(232,242,252,0.22)",
  boundary: "rgba(232,242,252,0.16)",
  countyLine: "rgba(232,242,252,0.13)",
  chromeHex: "#33495c",
} as const;

// Authored hypsometric ramp — WE color the elevation (Imhof tradition), the land is
// designed, not filtered. Meters above sea level → petrol coast, sage hill country,
// clay Permian shelf, bone caprock. Low chroma so data stays the only loud color.
export const RELIEF_RAMP: [number, string][] = [
  [0, "#1e3a47"],
  [120, "#24464f"],
  [350, "#2f5152"],
  [650, "#3f5a51"],
  [950, "#5d5c4c"],
  [1300, "#75634e"],
  [1800, "#8f7a5c"],
  [2300, "#ab9573"],
  [2667, "#c2b18d"],
];
